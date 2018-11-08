var debug = {};
var app = null;
var KB = 1024, MB = KB * KB;
var formatNb = nb => Number(nb).toLocaleString();

var DIR_IMPORTS = [ "seqtk.js" ];

// Seqtk output columns (original seqtk version)
var COL_FQCHK_NUM_HEADER_LINES = 2,
    COL_COMP_READLENGTH = 1,
    COL_COMP_C = 3,
    COL_COMP_G = 4;

// // Seqtk output columns (trimmed version)
// var COL_FQCHK_NUM_HEADER_LINES = 1,
//     COL_COMP_READLENGTH = 0,
//     COL_COMP_C = 1,
//     COL_COMP_G = 2;

var TIMER_START = 0, TIMER_END = 0;


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
        this.done = false;
        this.visited = [];       // array of visited byte ranges
        this.resamples = 0;      // number of times resampled after couldn't find match
        this.chunks = 0;

        // Plotting
        this.plotIterations = 0; // number of times updated the plots

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
            TIMER_START = window.performance.now();
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
        var nextSampling = {};
        return this.aioli.sample(
            this.file,
            "isValidFastqChunk"
        ).then(d => {
            nextSampling = d;

            // Check if need to stop sampling
            if(nextSampling.done || this.paused)
            {
                TIMER_END = window.performance.now();
                console.log("Runtime:", TIMER_END - TIMER_START);
                console.log("Reads processed:", this.hist.readlength.length);
                console.log("Reads/s:", this.hist.readlength.length / ((TIMER_END - TIMER_START) / 1000));

                // If done sampling, also mark as paused
                if(nextSampling.done) {
                    this.done = true;
                    this.paused = true;
                }
                // One last update
                this.viz();
                debug = this;
                return;
            }

            // // Launch optimized "fqchk" command
            // return this.aioli.exec({
            //     chunk: nextSampling,
            //     args: ["fqchk", this.file],
            // }).then(data => {
            //     var output = data.data,
            //         outputComp = output.filter(row => row.length == 3),
            //         outputFqchk = output.filter(row => row.length > 3);
            //     this.parseOutputComp(outputComp);
            //     this.parseOutputFqchk(outputFqchk);
            //     // Update graphs & process next chunk
            //     this.viz();
            //     this.process();
            // });

            // Run comp
            return this.aioli.exec({
                chunk: nextSampling,
                args: ["comp", this.file],
            }).then(d => {
                if(d == null)
                    return;

                // Parse comp output
                this.parseOutputComp(d.data);

                // Run fqchk
                return this.aioli.exec({
                    chunk: nextSampling,
                    args: ["fqchk", this.file]
                });
            }).then((d) => {
                if(d == null)
                    return;

                // Parse fqchk output
                this.parseOutputFqchk(d.data);
                // Update graphs
                this.viz();
                this.process();
            });

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
            this.hist.gc.push(Math.round((read[COL_COMP_G] + read[COL_COMP_C]) / read[COL_COMP_READLENGTH] * 1000) / 1000);
        }
    }

    parseOutputFqchk(dataFqchk)
    {
        if(dataFqchk.length == 0)
            return;

        // Parse header
        var header = {},
            data = dataFqchk.slice(COL_FQCHK_NUM_HEADER_LINES + 1),
            tmpHeader = dataFqchk.slice(COL_FQCHK_NUM_HEADER_LINES - 1, COL_FQCHK_NUM_HEADER_LINES)[0];

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
                data: [{
                    x: this.hist.gc,
                    type: "histogram",
                    xbins: {
                        start: 0,
                        end: 1, 
                        size: 0.05,
                    }
                }],
                title: "Average GC Content per Read",
                titleX: "GC Content",
                titleY: "Counts",
                rangeY: undefined
            },
            "plot-dist-seq-length": {
                data: [{ x: this.hist.readlength, type: "histogram"} ],
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
        // Show number of reads processed
        var action = this.file.name.match(/.gz$/g) ? "Parsed" : "Sampled";
        $(".loadingfile > span").html(`${action} ${formatNb(this.hist.readlength.length)} reads`);
        // Update UI
        this.updateProgressUI();

        // Setup play/pause button on click
        $("#btnPause").off().click(() =>
        {
            // Toggle paused status
            this.paused = !this.paused;
            // Update button icon
            $("#btnPause").html(`<span class="fa fa-${ this.paused ? "play" : "pause" }"></span>`);
            // Update UI
            this.updateProgressUI();

            if(!this.paused)
                this.process();
        });
    }
    updateProgressUI()
    {
        // Show/hide pause button + progress bar
        $("#btnPause").css("display", this.done ? "none" : "inline");
        $(".progress").css("display", this.paused ? "none" : "");
    }
}


// =============================================================================
// Handlers
// =============================================================================

var app = null,
    btnUpload = document.querySelector("#btnNewFile"),
    btnSample = document.querySelector("#btnSample"),
    inputFile = document.querySelector("#upload");

// Initialize app with given file
function initApp(file)
{
    if(app.launch(file)) {
        $(".containerMain").hide();
        $(".containerPreview").show();
        $(".spinner").hide();
    }
}

// Initialize fastq.bio on page load
document.addEventListener("DOMContentLoaded", function()
{
    // Setup app
    app = new FastqBio();
    app.init().then(() => {
        console.info("Aioli initialized.");
    });

    // Support URLs
    var fileURL = new URL(window.location).searchParams.get('url');
    if(fileURL != null && fileURL != '')
    {
        $(".spinner").show();
        setTimeout(function()
        {
            var request = new XMLHttpRequest();
            request.open("GET", fileURL, true);
            request.setRequestHeader("Range", "bytes=0-10000000");
            request.responseType = "blob";
            request.onload = function()
            {
                console.log("[FastqBioURL] Loaded file of size " + Math.round(request.response.size/1024/1024*100)/100 + "MB.")
                // Convert Blob to File
                var blob = request.response;
                blob.lastModifiedDate = new Date();
                // Launch
                initApp(new File([blob], fileURL.split("/").reverse()[0]));
            };
            request.send();
    
        }, 150);
    }
});    

// Event: click use sample FASTQ
btnSample.addEventListener("click", function(){
    var url = new URL(window.location);
    url.searchParams.set("url", "data/dx.fastq");
    window.location.search = url.search;    
});

// Event: click browse for files
btnUpload.addEventListener("click", function(){
    inputFile.click();
});

// Event: file has been selected
inputFile.addEventListener("change", function(){
    initApp(this.files[0]);
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
