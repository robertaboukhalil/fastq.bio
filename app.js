// ---------------------------------------------------------------------
// Support custom URL
// ---------------------------------------------------------------------
var customURL = getParameterByName("url");
if(customURL != null)
    launchURL(customURL);


// -----------------------------------------------------------------------------
// Handle Button Events
// -----------------------------------------------------------------------------
// Choose Sample FASTQ
document.querySelector("#btnSample").addEventListener("click", function(){
    launchURL("data/NA12878_U0a_CGATGT_L001_R1_005.fastq");
});
// Choose FASTQ File
document.querySelector("#upload").addEventListener("change", function(){
    launch(this.files[0]);
});
// New File
var arrEl = document.querySelectorAll(".btnNewFile");
for(var i = 0; i < arrEl.length; i++)
    arrEl[i].addEventListener("click", function(){
        document.querySelector("#upload").click();
    });


// ---------------------------------------------------------------------
// Launch analysis
// ---------------------------------------------------------------------
// Start sampling FASTQ file from URL
function launchURL(url)
{
    console.log("Reading FASTQ from " + url + "...");
    ga("send", "event", "launch", "url_load", url);

    document.querySelector(".spinner").style.display = "block";
    document.querySelector(".footer").style.display = "none";
    document.querySelector(".loadingfile").style.display = "block";
    document.querySelector(".loadingfile").innerHTML = "Loading file..."
    document.querySelector(".containerMain").style.display = "none";

    setTimeout(function()
    {
        var request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.responseType = "blob";
        request.onload = function()
        {
            console.log("Found file of size " + request.response.size/1024/1024 + "MB.")
            ga("send", "event", "launch", "url_loaded", url, request.response.size);
            // Convert Blob to File
            var blob = request.response;
            blob.lastModifiedDate = new Date();
            blob.name = url.split("/").reverse()[0];
            // Launch
            launch(blob);
        };
        request.send();
    }, 500);
}

// Start sampling FASTQ file
function launch(file)
{
    if(!FASTQ.isValidFileName(file)) {
        alert("Error: please choose a FASTQ file.");
        return;
    }

    ga("send", "event", "launch", "reading");

    // Hide footer past front page
    document.querySelector(".footer").style.display = "none";

    // Start reading file with a delay (prevent file open window from remaining visible)
    document.querySelector(".spinner").style.display = "block";
    document.querySelector(".loadingfile").style.display = "block";
    document.querySelector(".loadingfile").innerHTML = "Parsing reads from <i>" + file.name + "</i>..."

    setTimeout(function()
    {
        FASTQ.getNextChunk(file, 20, {
            preread: function() {
                document.querySelector(".spinner").style.display = "block";
                document.querySelector(".containerMain").style.display = "none";
                document.querySelector(".containerPreview").style.display = "block";
                document.querySelector("#headerBtnNewFile").style.display = "none";
                document.querySelector("#headerBtnNewFile").disabled = true;
            },
            postread: function(fastqStats) {
                plotStats(fastqStats);
                launch(file);
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


// ---------------------------------------------------------------------
// Plotting
// ---------------------------------------------------------------------
var tmp={};
function plotStats(fastqStats)
{
    ga("send", "event", "launch", "plotting");

    // If no stats to plot
    if(fastqStats == null) {
        alert("No data found in FASTQ file. Please load a different file.")
        window.location = '/';
        return false;
    }

    // Default Plotly config
    var plotlyConfig = {
        modeBarButtonsToRemove: ['sendDataToCloud', 'autoScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian', 'lasso2d', 'select2d', 'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d', 'toggleSpikelines'],
        displaylogo: false, showTips: true
    };

    // -- Calculate FASTQ statistics
    // Number of reads
    var nbReads = Math.round(fastqStats.reads / 1000);
    // Calculate sequence content per base as function of position
    var seqContents = { A:[], C:[], G:[], T:[], N: [] };
    fastqStats.nucl.map(function(cnt, i)
    {
        var totBases = cnt.A + cnt.C + cnt.G + cnt.T;
        seqContents.A[i] = Math.round(cnt.A / totBases * 1000) / 1000;
        seqContents.C[i] = Math.round(cnt.C / totBases * 1000) / 1000;
        seqContents.G[i] = Math.round(cnt.G / totBases * 1000) / 1000;
        seqContents.T[i] = Math.round(cnt.T / totBases * 1000) / 1000;
        seqContents.N[i] = Math.round(cnt.N / totBases * 1000) / 1000;
    });
    // Calculate average base quality as function of position
    var seqQuality = [];
    fastqStats.qual.map(function(qualities, i) {
        seqQuality[i] = qualities.reduce(function(x,y){ return x+y; }) / qualities.length;
    });

    // -- Plots
    // Plot sequence content as function of position
    Plotly.newPlot('plot-per-base-sequence-content', [
        { y: seqContents.A, name: 'A' },
        { y: seqContents.C, name: 'C' },
        { y: seqContents.G, name: 'G' },
        { y: seqContents.T, name: 'T' },
    ], {
        title: "Per Base Sequence Content<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "Read Position" },
        yaxis: { title: "Composition" },
    }, plotlyConfig);

    // Plot average base quality as function of position
    Plotly.newPlot('plot-per-base-sequence-quality', [{
        y: seqQuality
    }], {
        title: "Per Base Sequence Quality<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "Read Position" },
        yaxis: { title: "Base Quality", range: [ 0, Math.max.apply(Math, seqQuality)*1.1 ] },
        showlegend: false
    }, plotlyConfig);

    // Plot N's as function of position
    Plotly.newPlot('plot-per-base-N-content', [
        { y: seqContents.N, name: 'N' }
    ], {
        title: "Per Base N Content<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "Read Position" },
        yaxis: { title: "Frequency", range: [0, 1] },
    }, plotlyConfig);

    // Plot histogram of average GC content per read
    Plotly.newPlot('plot-dist-gc-content-per-read', [{
        x: fastqStats.avgGC,
        type: 'histogram',
        xbins: {
            start: 0,
            end: 1, 
            size: 0.05,
        },
    }], {
        title: "Average GC Content per Read<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "GC Content" },
        yaxis: { title: "Counts" },
        showlegend: false,
    }, plotlyConfig);

    // Plot histogram of average quality score per read
    Plotly.newPlot('plot-dist-qual-per-read', [{
        x: fastqStats.avgQual,
        type: 'histogram'
    }], {
        title: "Average Quality Score per Read<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "Quality Score" },
        yaxis: { title: "Counts" },
        showlegend: false,
    }, plotlyConfig);

    // Plot histogram of sequence length
    Plotly.newPlot('plot-dist-seq-length', [{
        x: fastqStats.seqlen,
        type: 'histogram'
    }], {
        title: "Sequence Length Distribution<br><i>Sampled first " + nbReads + "K reads</i>",
        xaxis: { title: "Sequence Length" },
        yaxis: { title: "Counts" },
        showlegend: false
    }, plotlyConfig);

}


// ---------------------------------------------------------------------
// Handle Drag and Drop
// ---------------------------------------------------------------------
// On drag over
function dragover_handler(evt) {
    evt.preventDefault();
    document.querySelector("body").style.border = "2px dashed #2663a8";
    return;
}

// On drag end
function dragend_handler(evt) {
    evt.preventDefault();
    document.querySelector("body").style.border = "0";
    return;
}

// On drag
function drop_handler(evt)
{
    evt.preventDefault();
    document.querySelector("body").style.border = "0";

    // Check if user dropped a file
    var f = {};
    var dataTransfer = evt.dataTransfer;

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


// ---------------------------------------------------------------------
// Misc.
// ---------------------------------------------------------------------
// Source: https://stackoverflow.com/a/901144
function getParameterByName(name, url)
{
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

