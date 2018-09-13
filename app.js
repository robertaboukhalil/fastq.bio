var debug = {};
var app = null;

DIR_IMPORTS = [ "seqtk.js", "assets/papaparse/papaparse-4.6.0.min.js" ];

CHUNK_SIZE = 1/8 * 1024 * 1024;  // in bytes

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
    constructor(file)
    {
        // Internal state
        this.file = file;
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

        // Validate file name
        var status = this.validate();
        if(!status.valid) {
            alert(status.message);
            return;
        }

        // Create Aioli (and the WebWorker in which WASM code will run)
        this.aioli = new Aioli({
            imports: DIR_IMPORTS
        });

        // Initialize WASM within WebWorker
        this.aioli.init().then(d => {
            // Show empty plot and keep re-plotting
            this.viz();
            this.plotTimer = setInterval(() => this.viz(), 200);
            // Launch first process
            this.process();
        });
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
        var sampling = this.sample();
        if(sampling.done || this.paused)
        {
            // One last update
            this.paused = true;
            clearInterval(this.plotTimer);
            this.viz();

            console.log("--- Done ---");
            debug = this;
            return;
        };

        // console.log("Sampling ", sampling.start, "-->", sampling.end);

        // Mount file chunk to filesystem
        this.chunks++;
        var chunkName = `c${this.chunks}-${this.file.name}`;
        this.aioli.mount({
            blobs: [{
                name: chunkName,
                data: this.file.slice(sampling.start, sampling.end)
            }]

        // Run comp on chunk (stats for GC composition + read length distribution)
        }).then(() => {
            return this.aioli.exec("comp", {
                filename: chunkName
            });

        // Then gather results
        }).then(d => {
            for(var read of d.data)
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

            // Run fqchk
            return this.aioli.exec("fqchk", {
                filename: chunkName
            });
        // Run fqchk on chunk (stats as function of read position)
        }).then(d => {
            var data = d.data.slice(3),
                header = {};
            
            var tmpHeader = d.data.slice(1, 2)[0];
            for(var i in tmpHeader)
                header[ tmpHeader[i] ] = i;

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

            // Process next chunk
            this.process();
        });
    }

    // -------------------------------------------------------------------------
    // Find next region to sample from
    // -------------------------------------------------------------------------
    sample()
    {
        this.resamples++;
        var sampling = {
            start: 0,
            end: 0,
            done: false
        };

        // If small file, don't sample; use the whole file
        if(this.file.size <= CHUNK_SIZE * 5)
            sampling.end = this.file.size;
        // Otherwise, sample randomly from file (test: startPos = 1068, endPos = 1780)
        else {
            // Make first few iterations faster to show the plot for first time
            var chunk_size = this.plotIterations < 5 ? CHUNK_SIZE / 32 : CHUNK_SIZE;
            sampling.start = Math.floor(Math.random() * (this.file.size + 1));
            sampling.end = Math.min(sampling.start + chunk_size, this.file.size);
        }

        // Have we already sampled this region?
        var reSample = false;
        for(var range of this.visited)
        {
            // --------vvvvvvvvvv---
            //            ssss->
            if(sampling.start >= range[0] && sampling.start <= range[1])
            {
                // --------vvvvvvvvvv---
                //             ssss
                if(sampling.end <= range[1]) {
                    reSample = true;
                    break;
                }
                // --------vvvvvvvvvv---
                //                ssssss
                else
                    sampling.start = range[1];
            }

            // --------vvvvvvvvvv---
            //            <-sss
            if(sampling.end >= range[0] && sampling.end <= range[1])
            {
                // --------vvvvvvvvvv---
                //            sssss
                if(sampling.start >= range[0]) {
                    reSample = true;
                    break;                    
                }
                // --------vvvvvvvvvv---
                //    sssssssssssss
                else
                    sampling.end = range[0];
            }

            // console.log("\tSample", sampling.start, "-->", sampling.end);
        }

        if(this.resamples > 3) {
            sampling.done = true;
        } else if(reSample) {
            return this.sample();
        } else {
            this.resamples = 0;
        }

        this.visited.push([sampling.start, sampling.end]);
        return sampling;
    }

    // -------------------------------------------------------------------------
    // Update visualization
    // -------------------------------------------------------------------------
    viz()
    {
        this.updateProgress();

        // Plot title
        var plotInfo = `Sampled ${formatNb(this.hist.readlength.length)} reads`;

        // Plot sequence content as function of position
        // First time plotting:
        if(this.plotIterations == 0)
        {
            var plotlyConfig = {
                modeBarButtonsToRemove: [
                    'sendDataToCloud', 'autoScale2d', 'hoverClosestCartesian',
                    'hoverCompareCartesian', 'lasso2d', 'select2d', 'zoom2d',
                    'pan2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d', 'toggleSpikelines'],
                displaylogo: false, showTips: true
            };
    
            Plotly.newPlot('plot-per-base-sequence-content', [
                { y: this.stats.A, name: 'A' },
                { y: this.stats.C, name: 'C' },
                { y: this.stats.G, name: 'G' },
                { y: this.stats.T, name: 'T' },
                { y: this.stats.N, name: 'N' },
            ], {
                title: "Per Base Sequence Content<br>" + plotInfo,
                xaxis: { title: "Read Position" },
                yaxis: { title: "Composition" },
            }, plotlyConfig);
        }
        // Otherwise, just update the plot
        else
        {
            Plotly.update('plot-per-base-sequence-content', {
                y: [ this.stats.A, this.stats.C, this.stats.G, this.stats.T, this.stats.N ]
            });
            Plotly.relayout('plot-per-base-sequence-content', {
                title: "Per Base Sequence Content<br>" + plotInfo
            });
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
}



// =============================================================================
// UI Handlers
// =============================================================================

// Browse for files
var arrEl = document.querySelectorAll(".btnNewFile");
for(var i = 0; i < arrEl.length; i++)
    arrEl[i].addEventListener("click", function(){
        document.querySelector("#upload").click();
    });

// A file has been selected
document.querySelector("#upload").addEventListener("change", function(){
    app = new FastqBio(this.files[0]);
    $(".containerMain").hide();
    $(".containerPreview").show();
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

        launch(f);
        return;
    }
}
