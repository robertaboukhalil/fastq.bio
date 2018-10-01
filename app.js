var debug = {};
var app = null;

DIR_IMPORTS = [ "seqtk.js" ];

CHUNK_SIZE = 1 * 1024 * 1024;  // in bytes

COL_COMP_READLENGTH = 1;
COL_COMP_A = 2;
COL_COMP_C = 3;
COL_COMP_G = 4;
COL_COMP_T = 5;

var formatNb = nb => Number(nb).toLocaleString();


// =============================================================================
// fastq.bio class
// =============================================================================

class FastqBio
{
    constructor()
    {
        // Internal state
        this.file = null;
        this.aioli = null;
        this.paused = false;
        this.visited = [];       // array of visited byte ranges
        this.resamples = 0;      // number of times resampled after couldn't find match
        this.chunks = 0;

        // Plotting
        this.plotIterations = 0; // number of times updated the plots
        this.plotTimer = null;

        // Histograms
        this.hist = {
            readlength: [],
            gc: []
        };
        // Position-based stats (track raw counts and final %s)
        this.stats_raw = {
            A: {}, C: {}, G: {}, T: {}, N: {}, avgQ: {},
            Atot: {}, Ctot: {}, Gtot: {}, Ttot: {}, Ntot: {}, avgQtot: {}
        };
        this.stats = {};

        debug = this;
    }

    init()
    {
        // Create Aioli (and the WebWorker in which WASM code will run)
        this.aioli = new Aioli({
            imports: DIR_IMPORTS
        });

        // Initialize WASM within WebWorker (returns a promise; not used here)
        return this.aioli.init();
    }

    launch(file)
    {
        this.file = file;

        // Validate file name
        var status = this.validate();
        if(!status.valid) {
            alert(status.message);
            return false;
        }

        // Show (empty) plot
        this.viz();

        // Mount file and start sampling
        this.aioli.mount({
            files: [ this.file ]
        }).then(() => {
            this.process();
        });

        // Return true => valid FASTQ name
        return true;
    }

    // -------------------------------------------------------------------------
    // Validate FASTQ file name
    // -------------------------------------------------------------------------
    validate()
    {
        var status = { valid: false, message: "" },
            fastqRegex = /.fastq|.fq|.fastq.gz|.fq.gz/;

        if(this.file == null || !("name" in this.file))
            status.message = "Please choose a valid FASTQ file";
        else if(!this.file.name.match(fastqRegex))
            status.message = "Invalid FASTQ filename <" + this.file.name + ">. \n\nMust end with .fastq, .fastq.gz, .fq, or .fq.gz";
        else
            status.valid = true;

        return status;
    }

    // -------------------------------------------------------------------------
    // Process data
    // -------------------------------------------------------------------------
    process()
    {
        // Find next chunk to sample.
        // Note: isValidFastqChunk() is defined in aioli.user.js
        var getNextChunk = this.aioli.sample(this.file, "isValidFastqChunk");
        var nextSampling = {};
        return getNextChunk.then(d =>
        {
            nextSampling = d;

            // Check if need to stop sampling
            if(nextSampling.done || this.paused)
            {
                // One last update
                this.paused = true;
                clearInterval(this.plotTimer);
                this.viz();
                debug = this;
                return;
            }

            // Run comp
            return this.aioli.exec({
                chunk: nextSampling
            }, "comp", this.file);
        }).then(d => {
            if(d == null)
                return;

            // Parse comp output
            this.parseOutputComp(d.data);

            // Run fqchk
            return this.aioli.exec({
                chunk: nextSampling
            }, "fqchk", this.file);
        }).then((d) => {
            if(d == null)
                return;

            // Parse fqchk output
            this.parseOutputFqchk(d.data);
            // Update graphs
            this.viz();
            this.process();
        }).catch(e => {
            console.error(`Error: ${e}. Skipping...`);
        });
    }

    // -------------------------------------------------------------------------
    // Parse outputs
    // -------------------------------------------------------------------------

    // Parse seqtk output
    parseOutputComp(dataComp)
    {
        if(dataComp.length == 0)
            return;

        // Parse comp output
        for(var read of dataComp)
        {
            // Ignore zero-length reads output by "seqtk comp". This happens if
            // we're sampling random bytes from the FASTQ file, and start reading
            // from the middle of a read ==> seqtk returns readlength = 0. This
            // shouldn't happen since we provide a validChunk callback.
            if(read[COL_COMP_READLENGTH] == 0)
                continue;

            // Save read length
            this.hist.readlength.push(read[COL_COMP_READLENGTH]);
            // Save GC composition
            this.hist.gc.push(read[COL_COMP_G] + read[COL_COMP_C]);
        }
    }

    parseOutputFqchk(dataFqchk)
    {
        if(dataFqchk.length == 0)
            return;

        // Parse header
        var header = {},
            data = dataFqchk.slice(3),
            tmpHeader = dataFqchk.slice(1, 2)[0];

        for(var i in tmpHeader)
            header[ tmpHeader[i] ] = i;

        // Parse stats
        for(var row of data)
        {
            var pos = row[header["POS"]],
                nbBases = row[header["#bases"]];

            if(!(pos in this.stats_raw.A))
                for(var k in this.stats_raw)
                    this.stats_raw[k][pos] = 0;

            // Base composition + avgQ stats
            for(var base of ["A", "C", "G", "T", "N", "avgQ"]) {
                var header_name = base != "avgQ" ? `%${base}` : base;
                this.stats_raw[base][pos] += nbBases * row[header[header_name]]
                this.stats_raw[`${base}tot`][pos] += nbBases
            }
        }

        // Normalize sum so far
        for(var metric of ["A", "C", "G", "T", "N", "avgQ"])
            this.stats[metric] = Object.keys(this.stats_raw[metric]).map( k => this.stats_raw[metric][k] / this.stats_raw[`${metric}tot`][k] );
    }

    // -------------------------------------------------------------------------
    // Update visualization
    // -------------------------------------------------------------------------
    viz()
    {
        this.updateProgress();

        // Plot config
        var plotlyConfig = { modeBarButtonsToRemove: [ 'sendDataToCloud', 'autoScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian', 'lasso2d', 'select2d', 'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d', 'toggleSpikelines' ], displaylogo: false, showTips: true };

        // Define data to plot
        var dataToPlot = {
            "plot-per-base-sequence-content": {
                data: ["A", "C", "G", "T", "N"].map(base => ({ y: this.stats[base], name: base })),
                title: "Per Base Sequence Content",
                titleX: "Read Position",
                titleY: "Composition",
                rangeY: [0, 50]
            },
            "plot-per-base-sequence-quality": {
                data: [{ y: this.stats.avgQ, name: "avgQ" }],
                title: "Per Base Sequence Quality",
                titleX: "Read Position",
                titleY: "Base Quality",
                rangeY: [0, 50] // this.stats.avgQ == null ? null : Math.max(...this.stats.avgQ.filter(n => Number.isFinite(n))) * 1.1
            },
            "plot-dist-gc-content-per-read": {
                data: [{ x: this.hist.gc, type: "histogram" }],
                title: "Average GC Content per Read",
                titleX: "GC Content",
                titleY: "Counts",
                rangeY: undefined
            },
            "plot-dist-seq-length": {
                data: [{ x: this.hist.readlength, type: "histogram" }],
                title: "Read Length Distribution",
                titleX: "Read Length",
                titleY: "Counts",
                rangeY: undefined
            }
        };

        for(var plotEl in dataToPlot)
        {
            var plot = dataToPlot[plotEl];

            // First time plotting:
            if(this.plotIterations == 0)
                Plotly.newPlot(plotEl, plot.data, {
                    title: plot.title,
                    xaxis: { title: plot.titleX },
                    yaxis: { title: plot.titleY, range: plot.rangeY }
                }, plotlyConfig);
            // Otherwise, just update the plot
            // Note: to update title, also need Plotly.relayout(plotEl, { title: newTitle })
            else
                Plotly.update(plotEl, { y: plot.data.map(obj => obj.y) });
        }
        this.plotIterations++;
    }

    // Update progress status in UI
    updateProgress()
    {
        var action = this.file.name.match(/.gz$/g) ? "Parsed" : "Sampled";
        $(".spinner, #btnStop").css("display", this.paused ? "none" : "block");
        $(".loadingfile").html(`${action} ${formatNb(this.hist.readlength.length)} reads`);
        $("#btnStop").off().click(() => {
            $("#btnStop").prop("disabled", true);
            this.paused = true}
        );
    }
}


// =============================================================================
// Handlers
// =============================================================================

var app = null,
    btnUpload = document.querySelector("#btnNewFile"),
    inputFile = document.querySelector("#upload");

// Initialize fastq.bio on page load
document.addEventListener("DOMContentLoaded", function()
{
    app = new FastqBio();
    app.init().then(() => {
        console.info("Aioli initialized.");
    });
});    

// Event: click browse for files
btnUpload.addEventListener("click", function(){
    inputFile.click();
});

// Event: file has been selected
inputFile.addEventListener("change", function(){
    if(app.launch(this.files[0])) {
        $(".containerMain").hide();
        $(".containerPreview").show();    
    }
});

// Handle Drag and Drop
function dragAndDrop(event)
{
    event.preventDefault();
    document.querySelector("body").style.border = "0";

    if(event.type == "dragover")
        document.querySelector("body").style.border = "2px dashed #2663a8";
    else if(event.type == "drop")
    {
        // Check if user dropped a file
        var f = {};
        var dataTransfer = event.dataTransfer;

        // Retrieve dropped file
        if(dataTransfer.items)
            if (dataTransfer.items[0].kind == "file")
                f = dataTransfer.items[0].getAsFile();
        else
            f = dataTransfer.files[i];

        app.launch(f);
        return;
    }
}
