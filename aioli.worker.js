
DIR_DATA = "/data";

VALID_ACTIONS = [
    "init",
    "mount"
];

FILES = {};

N = 0;


// WebWorker setup
self.onmessage = function(msg)
{
    var data = msg.data;
    var id = data.id,
        action = data.action,
        config = data.config;

    // Valid actions
    // TODO: validate configs
    if(VALID_ACTIONS.indexOf(action) == -1)
    {
        self.postMessage({
            id: id,
            action: "error",
            message: `Invalid action <${action}>.`
        });
        return;
    }

    // Initialize Worker
    if(action == "init") {
        self.importScripts(...config);
        FS.mkdir(DIR_DATA, 0777);
    }

    // Mount file(s) and/or blob(s) to the Worker's file system
    // Can only mount a folder one at a time, so
    if(action == "mount")
    {
        // Define folder for current batch of files
        var dir = `${DIR_DATA}/${N++}`;

        // Define file system to mount
        var fs = {}, filesAndBlobs = [];
        if("files" in config) {
            fs.files = config.files;
            filesAndBlobs.concat(fs.files);
        }
        if("blobs" in config) {
            fs.blobs = config.blobs;
            filesAndBlobs.concat(fs.blobs);
        }

        // Create folder and mount
        FS.mkdir(dir, 0777);
        FS.mount(WORKERFS, fs, dir);

        // Keep track of mounted files
        for(var f of filesAndBlobs)
        FILES[f.name] = N;
    
        console.info(FS.readdir(dir));
    }

    self.postMessage({
        id: id,
        action: "callback",
        message: "ready"
    });
}



// // =============================================================================
// // Config
// // =============================================================================

// // Worker state
// WORKER = {
//     // Worker filesystem folders
//     dir: {
//         root: "/data",
//         input: "/data/input/",
//         output: "/data/output/"
//     },
//     files: [],
//     //
//     interval: null,
//     filename: null,
//     ready: false,
//     output: {
//         sample: "",
//         fqchk: ""
//     },
//     running: ""
// }


// // =============================================================================
// // Worker logic
// // =============================================================================

// // Mount File object to worker's file system
// self.onmessage = function(msg)
// {
//     worker.ready = true;
//     console.log(FS.readdir(DIR_INPUT));
// }


// // =============================================================================
// // Emscripten module logic
// // =============================================================================

// Module = {};
// Module["noInitialRun"] = true;

// // Capture printing to stdout
// Module["print"] = function(text) {
//     if(worker.running == "sample" || worker.running == "fqchk")
//         worker.output[worker.running] += text + "\n";
//     else
//         console.log("stdout: " + text);
// };

// // On module load
// Module["onRuntimeInitialized"] = function()
// {
//     // Wait till file is mounted to file system before running seqtk
//     worker.interval = setInterval(() => 
//     {
//         if(worker.ready)
//         {
//             clearInterval(worker.interval);
//             console.log("Launching...");

//             // Get QC report
//             console.time("fqchk");
//             worker.running = "fqchk";
//             Module.callMain(["comp", worker.filename]);
//             worker.running = "";
//             console.timeEnd("fqchk");

//             // arguments: argc, argv*
//             // fn = Module.cwrap("stk_fqchk", "string", ["number", "array"]);
//             // wat = fn(2, ["/data/" + worker.filename, ""]);
//             console.log("/Done");
//             postMessage(worker.output.fqchk);
//         }
//     }, 500);
// };

