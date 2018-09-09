var debug = {};
var app = null;

DIR_WASM = "seqtk.js";
CHUNK_SIZE = 1/8 * 1024 * 1024;  // in bytes


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
        this.visited = [];  // array of visited byte ranges
        this.resamples = 0; // number of times resampled after couldn't find match
        this.chunks = 0;

        // Validate file name
        var status = this.validate();
        if(!status.valid) {
            alert(status.message);
            return;
        }

        // Create Aioli (and the WebWorker in which WASM code will run)
        this.aioli = new Aioli({
            imports: [ DIR_WASM ]
        });

        // Initialize WASM within WebWorker
        this.aioli.init().then(d => {
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
        if(sampling.done) {
            console.log("DONE");
            return;
        };

        console.log("Sampling ", sampling.start, "-->", sampling.end);

        // Mount file chunk to filesystem
        this.chunks++;
        var chunkName = `c${this.chunks}-${this.file.name}`;
        this.aioli.mount({
            blobs: [{
                name: chunkName,
                data: this.file.slice(sampling.start, sampling.end)
            }]

        // Run fqchk on chunk (stats as function of read position)
        }).then(d => {
            return this.aioli.exec("comp", {
                filename: chunkName
            });

        // // Run comp on chunk (stats for GC composition + read length distribution)
        // }).then(d => {
        //     console.log(d);

        //     return this.aioli.exec("comp", {
        //         filename: this.file.name
        //     });

        // Then gather results
        }).then(d => {
            console.log(d.slice(0,300));
            console.log("- NEXT -");

            this.process();
        });
    }

    // Find next region to sample from
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
            sampling.start = Math.floor(Math.random() * (this.file.size + 1));
            sampling.end = Math.min(sampling.start + CHUNK_SIZE, this.file.size);
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
