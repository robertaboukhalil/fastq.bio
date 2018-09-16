// =============================================================================
// WebWorker
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

MB = 1024 * 1024;
DEBUG = false;
DIR_DATA = "/data";
VALID_ACTIONS = [ "init", "mount", "exec", "sample" ];


// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

self.state = {
    // File management
    n: 0,           // file ID
    files: {},      // key: file ID, value: {id:n, sampling:AioliSampling}
    reader: new FileReader(),
    // Function management
    output: {},     // key: wasm function
    running: "",    // wasm function currently running
};


// =============================================================================
// Process incoming messages
// =============================================================================

self.onmessage = function(msg)
{
    var data = msg.data;
    var id = data.id,
        action = data.action,
        config = data.config,
        returnValue = null;

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

    // -------------------------------------------------------------------------
    // Initialize Worker
    // -------------------------------------------------------------------------
    if(action == "init") {
        DEBUG = config.debug;
        self.importScripts('aioli.user.js', ...config.imports);
        FS.mkdir(DIR_DATA, 0777);
    }

    // -------------------------------------------------------------------------
    // Mount file(s) and/or blob(s) to the Worker's file system
    // Can only mount a folder one at a time, so
    // -------------------------------------------------------------------------
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
            self.state.files[f.name] = {
                id: self.state.n,
                sampling: new AioliSampling(f)
            }
    }

    // -------------------------------------------------------------------------
    // Execute WASM functions
    // -------------------------------------------------------------------------
    if(action == "exec")
    {
        for(var i in config) {
            var c = config[i];
            if(typeof(c) == "object" && "filename" in c)
                config[i] = getFilePath(c);
        }

        // Launch function
        if(DEBUG) console.info(`[AioliWorker] Launching`, ...config);
        if(DEBUG) console.time("[AioliWorker] " + config[0]);
        self.state.running = id;
        Module.callMain(config);
        self.state.running = "";
        if(DEBUG) console.timeEnd("[AioliWorker] " + config[0]);

        // arguments: argc, argv*
        // fn = Module.cwrap("stk_fqchk", "string", ["number", "array"]);
        // fn2 = fn(2, ["/data/" + worker.filename, ""]);

        returnValue = Papa.parse(self.state.output[id], {
            dynamicTyping: true
        });
    }

    // -------------------------------------------------------------------------
    // Sample file and return valid chunk range
    // -------------------------------------------------------------------------
    if(action == "sample")
    {
        var file = config.file,
            sampling = getFileInfo(file).sampling,
            fnValidChunk = CALLBACKS[config.isValidChunk];

            // Catch promise and return message when ready
            sampling.nextRegion(fnValidChunk)
                    .then((d) => {
                        self.postMessage({
                            id: id,
                            action: "callback",
                            message: d
                        });        
                    });
        return;
    }

    // -------------------------------------------------------------------------
    // Send message back
    // -------------------------------------------------------------------------
    if(returnValue != null)
        self.postMessage({
            id: id,
            action: "callback",
            message: returnValue
        });
    else
        self.postMessage({
            id: id,
            action: "callback",
            message: "ready"
        });
}


// =============================================================================
// Emscripten module logic
// =============================================================================

// Defaults: don't auto-run WASM program once loaded
Module = {};
Module["noInitialRun"] = true;

// Capture stdout
Module["print"] = text => {
    if(!(self.state.running in self.state.output))
        self.state.output[self.state.running] = "";
    self.state.output[self.state.running] += text + "\n";
};


// =============================================================================
// Sampling logic
// =============================================================================

class AioliSampling
{
    constructor(file)
    {
        this.file = file;         // File or Blob to sample from
        this.visited = [];        // List of ranges already visited
        this.redraws = 0;         // Number of consecutive times we redraw random positions to sample

        // TODO: make these configurable
        this.maxRedraws = 10;     // Max number of consecutive redraws
        this.chunkSize = 1 * MB;  // Chunk size to read from
        this.chunkSizeValid = 1/512 * MB;  // Chunk size to read to determine whether chunk if valid
        this.smallFileFactor = 5; // Define a small file as N * chunkSize
    }


    // -------------------------------------------------------------------------
    // Find next region to sample from file
    // -------------------------------------------------------------------------

    nextRegion(isValidChunk)
    {
        this.redraws++;
        var sampling = {
            start: 0,
            end: 0,
            done: false
        };

        // If too many consecutive redraws, stop sampling
        if(this.redraws > this.maxRedraws) {
            sampling.done = true;
            return sampling;
        }

        // If small file, don't sample; use the whole file
        if(this.file.size <= this.chunkSize * this.smallFileFactor)
            sampling.end = this.file.size;
        // Otherwise, sample randomly from file (test: startPos = 1068, endPos = 1780)
        else {
            sampling.start = Math.floor(Math.random() * (this.file.size + 1));
            sampling.end = Math.min(sampling.start + this.chunkSize, this.file.size);
        }

        // Have we already sampled this region?
        var reSample = false;
        for(var range of this.visited)
        {
            // --------vvvvvvvvvv---
            //            ssss->
            if(sampling.start >= range[0] && sampling.start <= range[1])
                // --------vvvvvvvvvv---
                //             ssss
                if(sampling.end <= range[1])
                    reSample = true;
                // --------vvvvvvvvvv---
                //                ssssss
                else
                    sampling.start = range[1];

            // --------vvvvvvvvvv---
            //            <-sss
            if(sampling.end >= range[0] && sampling.end <= range[1])
                // --------vvvvvvvvvv---
                //            sssss
                if(sampling.start >= range[0])
                    reSample = true;
                // --------vvvvvvvvvv---
                //    sssssssssssss
                else
                    sampling.end = range[0];

            if(reSample)
                break;
            console.log(`[AioliSampling] - ${sampling.start} --> ${sampling.end}`);
        }
        if(reSample)
            return this.nextRegion();
        else
            this.redraws = 0;

        // Narrow down sampling region to valid start byte
        return new Promise((resolve, reject) => {
            self.state.reader.readAsBinaryString(this.file.slice(
                sampling.start,
                Math.min(sampling.end, sampling.start + this.chunkSizeValid)
            ));

            // Increment byte start till we get the correct byteOffset
            self.state.reader.onload = () => {
                var chunk = self.state.reader.result;
                var byteOffset = 0;
                while(!isValidChunk(chunk.slice(byteOffset)))
                    byteOffset++;

                // Mark current range as visited
                this.visited.push([ sampling.start + byteOffset, sampling.end ]);
                return resolve(sampling);
            };
        });
    }
}


// =============================================================================
// Utility functions
// =============================================================================

// Given File object, get its path on the virtual FS
function getFilePath(file)
{
    return `${DIR_DATA}/${getFileInfo(file).id}/${file.name}`;
}

// Given File object, return info about it
function getFileInfo(file)
{
    return self.state.files[file.name];
}
