// =============================================================================
// WebWorker
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

DEBUG = false;
DIR_DATA = "/data";
VALID_ACTIONS = [ "init", "mount", "exec" ];

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------
self.state = {
    // File management
    n: 0,           // file ID
    files: {},      // key: file ID, value: file/blob object
    // 
    output: {},     // key: wasm function
    running: "",    // wasm function currently running

};


// -----------------------------------------------------------------------------
// Process incoming messages
// -----------------------------------------------------------------------------

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
        DEBUG = config.debug;
        self.importScripts(...config.imports);
        FS.mkdir(DIR_DATA, 0777);
    }

    // Mount file(s) and/or blob(s) to the Worker's file system
    // Can only mount a folder one at a time, so
    if(action == "mount")
    {
        // Define folder for current batch of files
        self.state.n++;
        var dir = `${DIR_DATA}/${self.state.n}`;

        // Define file system to mount
        var fs = {}, filesAndBlobs = [];
        if("files" in config) {
            fs.files = config.files;
            filesAndBlobs = filesAndBlobs.concat(fs.files);
        }
        if("blobs" in config) {
            fs.blobs = config.blobs;
            filesAndBlobs = filesAndBlobs.concat(config.blobs);
        }

        // Create folder and mount
        FS.mkdir(dir, 0777);
        FS.mount(WORKERFS, fs, dir);

        // Keep track of mounted files
        for(var f of filesAndBlobs)
            self.state.files[f.name] = self.state.n;
    }

    // Execute WASM functions
    if(action == "exec")
    {
        for(var i in config) {
            var c = config[i];
            if(typeof(c) == "object" && "filename" in c)
                config[i] = `${DIR_DATA}/${self.state.files[ c.filename ]}/${c.filename}`;
        }

        // Launch function
        if(DEBUG) console.info(`[AioliWorker] Launching`, ...config);
        console.time("AioliWorker - " + config[0]);
        self.state.running = id;
        Module.callMain(config);
        self.state.running = "";
        console.timeEnd("AioliWorker - " + config[0]);

        // arguments: argc, argv*
        // fn = Module.cwrap("stk_fqchk", "string", ["number", "array"]);
        // fn2 = fn(2, ["/data/" + worker.filename, ""]);

        self.postMessage({
            id: id,
            action: "callback",
            message: self.state.output[id]
        });
        return;
    }

    self.postMessage({
        id: id,
        action: "callback",
        message: "ready"
    });
}


// -----------------------------------------------------------------------------
// Emscripten module logic
// -----------------------------------------------------------------------------

// Defaults: don't auto-run C program once loaded
Module = {};
Module["noInitialRun"] = true;

// Capture stdout
Module["print"] = text => {
    if(!(self.state.running in self.state.output))
        self.state.output[self.state.running] = "";
    self.state.output[self.state.running] += text + "\n";
};
