var debug = {};
var app = null;

DIR_WASM = "seqtk.js";
CHUNK_SIZE = 2 * 1024 * 1024;       // 2 MB


// =============================================================================
// fastq.bio class
// =============================================================================

class FastqBio
{
    constructor(file)
    {
        this.file = file;
        this.aioli = null;

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
            this.sample();
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
    // Sample
    // -------------------------------------------------------------------------
    sample()
    {
        // Randomly sample from file
        var startPos = Math.floor(Math.random() * (this.file.size + 1)),
            endPos = Math.min(startPos + CHUNK_SIZE, this.file.size);

        // Mount file chunk to filesystem
        this.aioli.mount({
            blobs: [{
                name: this.file.name,
                data: this.file.slice(startPos, endPos)
            }]
        // Run fqchk on that chunk
        }).then(d => {
            return this.aioli.exec("fqchk", {
                filename: this.file.name
            });
        // Then gather results
        }).then(d => {
            console.log("-----------------------");
            console.log(d);

            // this.sample();
        });
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
