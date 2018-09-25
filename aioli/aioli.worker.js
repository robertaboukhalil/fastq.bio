// =============================================================================
// WebWorker
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

KB = 1024;
MB = KB * KB;
DEBUG = false;
DIR_DATA = "/data";     // in virtual file system
DIR_WASM = "../wasm";   // in real file system
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
        config = data.config;

    // Valid actions
    if(VALID_ACTIONS.indexOf(action) == -1) {
        AioliWorker.postMessage(id, `Invalid action <${action}>.`, "error");
        return;
    }

    // -------------------------------------------------------------------------
    // Handle actions
    // -------------------------------------------------------------------------

    if(action == "init")
    {
        console.time("AioliInit");
        AioliWorker.init(config);
        AioliWorker.postMessage(id);        
        console.timeEnd("AioliInit");
    }

    if(action == "mount")
    {
        console.time("AioliMount");
        AioliWorker.mount(config);
        AioliWorker.postMessage(id);
        console.timeEnd("AioliMount");
    }

    if(action == "exec")
    {
        self.state.running = id;
        console.time("AioliExec");
        AioliWorker.exec(config);
        console.timeEnd("AioliExec");
        self.state.running = "";
        AioliWorker.postMessage(id, Papa.parse(self.state.output[id], {
            dynamicTyping: true
        }));
    }

    if(action == "sample")
    {
        AioliWorker.sample(config).then((range) => {
            AioliWorker.postMessage(id, range);
        });
    }
}


// =============================================================================
// Emscripten module logic
// =============================================================================

// Defaults: don't auto-run WASM program once loaded
Module = {};
Module.noInitialRun = true;
Module.locateFile = url => `${DIR_WASM}/${url}`;
// // TODO: check effect of setting this
// Module.TOTAL_STACK = 50 * 1024 * 2014;
// Module.TOTAL_MEMORY = 160 * 1024 * 2014;

// Capture stdout
Module.print = text => {
    if(!(self.state.running in self.state.output))
        self.state.output[self.state.running] = "";
    self.state.output[self.state.running] += text + "\n";
};


// =============================================================================
// Aioli - Worker logic
// =============================================================================

class AioliWorker
{
    // -------------------------------------------------------------------------
    // Import scripts and make data folder
    // -------------------------------------------------------------------------
    static init(config)
    {
        DEBUG = config.debug;

        self.importScripts(
            'aioli.user.js',
            ...config.assets,
            ...config.imports.map(Module.locateFile)
        );
        FS.mkdir(DIR_DATA, 0o777);
    }

    // -------------------------------------------------------------------------
    // Mount file(s) and/or blob(s) to the Worker's file system
    // Can only mount a folder one at a time, so assign each file a folder
    // -------------------------------------------------------------------------
    static mount(config)
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
        FS.mkdir(dir, 0o777);
        FS.mount(WORKERFS, fs, dir);

        // Keep track of mounted files
        for(var f of filesAndBlobs)
            self.state.files[f.name] = {
                id: self.state.n,
                sampling: new AioliSampling(f)
            }

        return getFilePath(f);
    }

    // -------------------------------------------------------------------------
    // Execute WASM functions
    // -------------------------------------------------------------------------
    static exec(options)
    {
        var config = options[0],
            args = options.slice(1);

        // Parse config, looking for File objects
        for(var i in args)
        {
            var c = args[i];
            if(typeof(c) == "object" && "name" in c)
            {
                // If not sampling chunk, use path as is
                if(!("chunk" in config))
                    args[i] = getFilePath(c);
                // Otherwise, first need to mount the chunk
                else {
                    args[i] = AioliWorker.mount({
                        blobs: [{
                            name: `sampled-${config.chunk.start}-${config.chunk.end}-${c.name}`,
                            data: c.slice(config.chunk.start, config.chunk.end)
                        }]
                    });
                }
            }
        }

        // Launch function
        if(DEBUG) console.info(`[AioliWorker] Launching`, ...args);
        if(DEBUG) console.time("[AioliWorker] " + args[0]);
        Module.callMain(args);
        if(DEBUG) console.timeEnd("[AioliWorker] " + args[0]);

        // arguments: argc, argv*
        // fn = Module.cwrap("stk_fqchk", "string", ["number", "array"]);
        // fn2 = fn(2, ["/data/" + worker.filename, ""]);
    }


    // -------------------------------------------------------------------------
    // Sample file and return valid chunk range
    // -------------------------------------------------------------------------
    static sample(config)
    {
        var file = config.file,
            sampling = getFileInfo(file).sampling,
            fnValidChunk = CALLBACKS[config.isValidChunk];

        // Return promise
        return sampling.nextRegion(fnValidChunk);
    }

    // -------------------------------------------------------------------------
    // Send message from WebWorker back to app
    // -------------------------------------------------------------------------
    static postMessage(id, message="ready", action="callback")
    {
        self.postMessage({
            id: id,
            action: action,
            message: message
        });
    }
}


// =============================================================================
// Aioli - Sampling logic
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
        this.chunkSize = 0.5 * MB;  // Chunk size to read from
        this.chunkSizeValid = 2 * KB;  // Chunk size to read to determine whether chunk if valid
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
            if(DEBUG)
                console.log(`[AioliSampling] - ${sampling.start} --> ${sampling.end}`);
        }
        if(reSample)
            return this.nextRegion();
        else
            this.redraws = 0;

        // Narrow down sampling region to valid start byte
        return new Promise((resolve, reject) =>
        {
            self.state.reader.readAsBinaryString(this.file.slice(
                sampling.start,
                Math.min(sampling.end, sampling.start + this.chunkSizeValid)
            ));

            // Increment byte start till we get the correct byteOffset
            self.state.reader.onload = () => {
                var chunk = self.state.reader.result;
                var byteOffset = 0;
                if(typeof(isValidChunk) == "function")
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
    if(typeof(file) == "string")
        console.error(`[AioliWorker] Expecting File object, not string.`);
    if(!("name" in file))
        console.error(`[AioliWorker] Invalid File object; missing "name".`);
    if(!(file.name in self.state.files))
        console.error(`[AioliWorker] File specified <${file.name}> needs to be mounted first.`);
    return self.state.files[file.name];
}
