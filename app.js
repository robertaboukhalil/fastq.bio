var debug = {};
var app = null;

DIR_IMPORTS = [ "seqtk/seqtk.js", "assets/papaparse.min.js" ];

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
    }

    init()
    {
        // Create Aioli (and the WebWorker in which WASM code will run)
        this.aioli = new Aioli({
            imports: DIR_IMPORTS
        });

        // Initialize WASM within WebWorker
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

        // // TODO: Show empty plot and keep re-plotting
        // this.viz();
        // this.plotTimer = setInterval(() => this.viz(), 500);

        // Mount file and start sampling
        this.mount().then(() => {
            this.process();
        });
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
    // Mount file to WebWorker FS
    // -------------------------------------------------------------------------
    mount()
    {
        return this.aioli.mount({
            files: [ this.file ]
        });
    }

    // -------------------------------------------------------------------------
    // Process data
    // -------------------------------------------------------------------------
    process()
    {
        // Find next chunk to sample.
        // Note: isValidFastqChunk() is defined in aioli.user.js
        var getNextChunk = this.aioli.sample(this.file, "isValidFastqChunk");
        return getNextChunk.then((range) => {
            console.log(range);

            return this.aioli.exec({
                chunk: range
            }, "comp", this.file);
        });

        // console.time("process()");

        // var sampling = this.sample();
        // if(sampling.done || this.paused)
        // {
        //     // One last update
        //     this.paused = true;
        //     clearInterval(this.plotTimer);
        //     this.viz();
        //     debug = this;
        //     return;
        // };

        // // Mount file chunk to filesystem
        // this.chunks++;
        // var chunkName = `c${this.chunks}-${this.file.name}`;
        // this.aioli.mount({
        //     blobs: [{
        //         name: chunkName,
        //         data: this.file.slice(sampling.start, sampling.end)
        //     }]

        // // Run comp on chunk (stats for GC composition + read length distribution)
        // }).then(() => {

        //     var chunk = { filename: chunkName };
        //     var promiseComp = new Promise((resolve, reject) => {
        //         this.aioli
        //             .exec("comp", chunk)
        //             .then(data => {
        //                 console.time("parseOutputComp");
        //                 this.parseOutputComp(data);
        //                 console.timeEnd("parseOutputComp");
        //                 resolve();
        //             });
        //     }); 

        //     var promiseFqchk = new Promise((resolve, reject) => {
        //         this.aioli
        //             .exec("fqchk", chunk)
        //             .then(data => {
        //                 console.time("parseOutputFqchk");
        //                 this.parseOutputFqchk(data);
        //                 console.timeEnd("parseOutputFqchk");
        //                 resolve();
        //             });
        //     }); 

        //     promiseFqchk();
        //     promiseComp();

        //     // Promise.all([ promiseComp, promiseFqchk ]).then((data) =>
        //     // {
        //     //     console.timeEnd("process()");

        //     //     // Process next chunk
        //     //     this.process();
        //     //     // console.log( this.hist.gc.length )

        //     //     // // Parse current chunk and update stats
        //     //     // // this.parseOutput(...data);
        //     //     // this.parseOutputComp(data[0]);
        //     //     // this.parseOutputFqchk(data[1]);
        //     //     // console.time("viz")
        //     //     // this.viz();
        //     //     // console.timeEnd("viz")
        //     // });
        // });
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
        $(".spinner, .loadingfile, #btnStop").css("display", this.paused ? "none" : "block");
        $(".loadingfile").html(`Sampled ${formatNb(this.hist.readlength.length)} reads...&nbsp;`);
        $("#btnStop").off().click(() => {
            $("#btnStop").prop("disabled", true);
            this.paused = true}
        );
    }

    // Parse seqtk output
    parseOutputComp(dataComp)
    {
        if(dataComp.length == 0)
            return;

        // Parse comp output
        for(var read of dataComp.data)
        {
            // Ignore zero-length reads output by "seqtk comp". This happens because
            // we're sampling random bytes from the FASTQ file, and will likely start
            // reading from the middle of a read ==> seqtk returns readlength = 0
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
        var data = dataFqchk.data.slice(3),

        // Parse header
        header = {};
        var tmpHeader = dataFqchk.data.slice(1, 2)[0];
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
        console.log("Aioli initialized.");
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
