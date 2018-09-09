// =============================================================================
// Aioli
// Requires browser support for WebWorkers, WebAssembly, ES6 Classes, and ES6 Promises
// =============================================================================

WORKER_DIR = "aioli.worker.js";
CHUNK_SIZE = 2 * 1024 * 1024;       // 2 MB
REQUESTS = {};                      // Keep track requests to webworkers + callbacks
DEBUG = false;


class Aioli
{
    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(config)
    {
        // IDs for message passing with WebWorker
        this.n = -1;
        // Track WebWorker used
        this.worker = null;
        // Track promises (indexed by this.n)
        this.resolves = {};
        this.rejects = {};
        this.imports = config.imports;

        // Validate
        var requiredKeys = ["imports"];
        for(var k of requiredKeys)
            if(!(k in config))
                Aioli.error(`Missing key <${k}>.`);

        // Launch WebWorker and watch for messages (make sure to bind "this")
        this.worker = new Worker(WORKER_DIR);
        this.worker.onmessage = this.workerCallback.bind(this);
    }

    init()
    {
        // Initialize WebWorker
        return this.workerSend("init", this.imports);
    }


    // -------------------------------------------------------------------------
    // Utility functions
    // -------------------------------------------------------------------------

    // Mount
    // config = { files:[], blobs:[] }
    mount(config)
    {
        return this.workerSend("mount", config);
    }

    // Launch WASM code
    exec()
    {
        return this.workerSend("exec", [...arguments]);
    }


    // -------------------------------------------------------------------------
    // Worker Communication
    // -------------------------------------------------------------------------

    // Callback called whenever get message back from WebWorker
    workerCallback(event)
    {
        var data = event.data;

        // Handle errors
        if(data.action == "error" && this.rejects[this.n] != null) {
            Aioli.error(data.id, "-", data.message);
            this.rejects[this.n]();
        }

        // Handle callback signal
        else if(data.action == "callback" && this.resolves[data.id] != null) {
            if(DEBUG)
                Aioli.info(data.id, "-", data.message);
            this.resolves[data.id](data.message);
        }

        // console.log("<worker>");
        // console.log(event.data);
        // console.log("</worker>");
    }

    // Send message to worker
    workerSend(action, config)
    {
        return new Promise((resolve, reject) =>
        {
            this.n++;

            // Track resolve/reject functions so can call them when receive message back from worker
            this.resolves[this.n] = resolve;
            this.rejects[this.n] = reject;

            // Send message to worker
            this.worker.postMessage({
                id: this.n,
                action: action,
                config: config
            });
        });
    }


    // -------------------------------------------------------------------------
    // Error management
    // -------------------------------------------------------------------------

    static info() {
        console.info(`[Aioli]`, ...arguments);
    }

    static error() {
        console.error(`[Aioli]`, ...arguments);
    }
}
