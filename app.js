// TODO:
// - Support URLs
// - Add back ga() in launch()

var debug = {};

// function Aioli(file)
// {
//     this.file = file;
//     this.visited = [];

//     // -------------------------------------------------------------------------
//     // Launch WebWorker
//     // -------------------------------------------------------------------------
//     this.launch = function()
//     {

//         this.parseNextChunk();
//     }

//     this.parseNextChunk = function()
//     {
//         // Randomly sample from file
//         var startPos = Math.floor(Math.random() * (this.file.size + 1)),
//             endPos = Math.min(startPos + CHUNK_SIZE, this.file.size);

//         // Get chunk of data from file
//         var blob = this.file.slice(startPos, endPos);

//         console.log( typeof(this.file) )
//         console.log( typeof({
//             name: this.file.name,
//             data: blob
//         }) )
// return

//         // Start parsing next chunk?
//         // if()
//     }
// }


// =============================================================================
// Launch analysis
// =============================================================================

// 
var aioli = null;
// var DIR_DATA = "/data";

// 
function launch(file)
{
    // Input validation
    var status = fqValidate(file);
    if(!status.valid) {
        alert(status.message);
        return;
    }

    // Setup Aioli
    var aioli = new Aioli({
        // WASM .js files to load
        imports: [
            "seqtk.js"
        ]
    })

    aioli.init().then(d => {
        console.log("init done");

        // Randomly sample from file
        var startPos = Math.floor(Math.random() * (file.size + 1)),
            endPos = Math.min(startPos + CHUNK_SIZE, file.size);

        // Mount file chunk to filesystem
        return aioli.mount({
            blobs: [{
                name: file.name,
                data: file.slice(startPos, endPos)
            }]
        });
    }).then(d => {
        return aioli.exec("comp", { filename: file.name });
    }).then(d => {
        console.log("-----------------------");
        console.log(d);
    });
}

// -------------------------------------------------------------------------
// Validate FASTQ file name
// -------------------------------------------------------------------------
function fqValidate(file)
{
    var status = { valid: false, message: "" },
        fastqRegex = /.fastq|.fq|.fastq.gz|.fq.gz/;

    if(file == null || !("name" in file))
        status.message = "Please choose a valid FASTQ file";
    else if(!file.name.match(fastqRegex))
        status.message = "Invalid FASTQ filename <" + file.name + ">. \n\nMust end with .fastq, .fastq.gz, .fq, or .fq.gz";
    else
        status.valid = true;

    return status;
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
    launch(this.files[0]);
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
