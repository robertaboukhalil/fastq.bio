worker = {
    interval: null,
    file: null,
    ready: false,
    output: {
        sample: "",
        fqchk: ""
    },
    running: ""
}

Module = {};
Module["print"] = function(text) {
    if(worker.running == "sample" || worker.running == "fqchk")
        worker.output[worker.running] += text + "\n";
    else
        console.log("stdout: " + text);
};

Module["noInitialRun"] = true;
Module["onRuntimeInitialized"] = function()
{
    // Wait till file is mounted to file system before running seqtk
    worker.interval = setInterval(() => 
    {
        if(worker.ready)
        {
            clearInterval(worker.interval);    
            console.log("Running sample() on", worker.file.name)

            // // Sample
            // worker.running = "sample";
            // Module.callMain(["sample", "/data/input/" + worker.file.name, "0.9"]);
            // worker.running = "";

            // // Save sampled FASTQ
            // console.log("Save to file");
            // FS.writeFile("/data/output/sampled.fastq", worker.output.sample);

            // // Get QC report
            // console.log("Running fqchk() on", worker.file.name);
            // worker.running = "fqchk";
            // Module.callMain(["fqchk", "/data/output/sampled.fastq"]);
            // worker.running = "";
            // Get QC report
            console.log("Running fqchk() on", worker.file.name);
            worker.running = "fqchk";
            Module.callMain(["fqchk", "/data/input/" + worker.file.name]);
            worker.running = "";

            // arguments: argc, argv*
            // fn = Module.cwrap("stk_fqchk", "string", ["number", "array"]);
            // wat = fn(2, ["/data/" + worker.file.name, ""]);
            console.log("/Done");
            postMessage(worker.output.fqchk);
        }
    }, 500);
};

self.importScripts("seqtk.js");

// Mount File object to worker's file system
self.onmessage = function(msg)
{
    // File system structure
    FS.mkdir("/data");
    FS.mkdir("/data/input");
    FS.mkdir("/data/output");

    // Mount File objects to the file system
    // Note the WORKERFS since we're inside a WebWorker
    worker.file = msg.data.file;
    FS.mount(WORKERFS, {
        files: [ worker.file ], // Array of File objects or FileList
    }, "/data/input");

    worker.ready = true;
    // console.log(FS.readdir("/data"));
}
