Module = {};
Module['noInitialRun'] = true;
self.importScripts('seqtk.js');

self.onmessage = function(msg)
{
    console.log(msg.data);

    FS.mkdir('/data');
    FS.mount(WORKERFS, {
        files: [ msg.data.file ], // Array of File objects or FileList
        }, '/data');

    // console.log( FS.readdir("/data") );

    Module['onRuntimeInitialized'] = function() {
        console.log("RUNNING", msg.data.file.name)
        Module.callMain(['fqchk', '/data/' + msg.data.file.name]);
        console.log("/RUNNING")
    };


	// postMessage(
	// 	init(
	// 		msg.data.id,
	// 		new Float64Array(msg.data.data),
	// 		msg.data.start,
	// 		msg.data.stop,
	// 		msg.data.rows,
	// 		msg.data.cols
	// 	)
	// );
}
