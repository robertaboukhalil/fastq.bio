// TODO:
// - Support URLs
// - Add back ga() in launch()




// ---------------------------------------------------------------------
// Launch analysis
// ---------------------------------------------------------------------

// Validate FASTQ file name
function validate(file)
{
    var status = { valid: false, message: "" },
        fastqRegex = /.fastq|.fq|.fastq.gz|.fq.gz/;

    if(file == null || !("name" in file))
        status.message = "Please choose a valid FASTQ file";
    else if(!file.name.match(fastqRegex))
        status.message = "Invalid FASTQ filename. Must end with .fastq, .fastq.gz, .fq, or .fq.gz";
    else
        status.valid = true;

    return status
}

// 
function launch(file)
{
    // Input validation
    var status = validate(file);
    console.log(status);
    if(!status.valid) {
        alert(status.message);
        return;
    }


    
    return;

    // Start reading file with a delay (prevent file open window from remaining visible)
    document.querySelector(".spinner").style.display = "block";
    document.querySelector(".loadingfile").style.display = "block";
    document.querySelector(".loadingfile").innerHTML = "Parsing reads from <i>" + file.name + "</i>..."

    setTimeout(function()
    {
        FASTQ.getNextChunk(file, {
            preread: function() {
                document.querySelector(".spinner").style.display = "block";
                document.querySelector(".containerMain").style.display = "none";
                document.querySelector(".containerPreview").style.display = "block";
                document.querySelector("#headerBtnNewFile").style.display = "none";
                document.querySelector("#headerBtnNewFile").disabled = true;
            },
            postread: function(fastqStats, samplingType) {
                // plotStats(fastqStats, samplingType);
                // launch(file);
            },
            lastread: function() {
                document.querySelector(".spinner").style.display = "none";
                document.querySelector(".loadingfile").style.display = "none";

                document.querySelector("#headerBtnNewFile").style.display = "block";
                document.querySelector("#headerBtnNewFile").disabled = false;
            }
        });
    }, 500);
}


// -----------------------------------------------------------------------------
// Handlers for buttons and drag & drop
// -----------------------------------------------------------------------------

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

        FASTQ.reset();
        launch(f);
        return;
    }
}
