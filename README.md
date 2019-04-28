# fastq.bio
An interactive web tool that generates quality metrics from DNA sequencing data.

This version runs the WebAssembly code in the browser. See [this repo](https://github.com/robertaboukhalil/fastq.bio-serverless) for the version of fastq.bio that runs the WebAssembly in a serverless fashion.

![Screenshot](https://res.cloudinary.com/indysigner/image/fetch/f_auto,q_auto/w_1600/https://cloud.netlifyusercontent.com/assets/344dbf88-fdf9-42bb-adb4-46f01eedd629/06e27be8-1fef-468b-9d23-40ae53e0a354/webassembly-speed-web-app1.png)

## Architecture

![Architecture](https://res.cloudinary.com/indysigner/image/fetch/f_auto,q_auto/w_1600/https://cloud.netlifyusercontent.com/assets/344dbf88-fdf9-42bb-adb4-46f01eedd629/a6d54294-e93c-496c-96b0-1888062913c5/webassembly-speed-web-app3.png)


- The DNA sequencing toolkit [seqtk](https://github.com/lh3/seqtk) is compiled from C to WebAssembly (see Makefile)
- Use [Aioli](https://github.com/robertaboukhalil/aioli) to mount the file a user is given onto a virtual file system in the browser
- Sample random chunks of data from the file and run `seqtk` on that chunk inside the WebWorker (to preserve the app's responsiveness)
- Update the plot with results

## Why WebAssembly

In short, WebAssembly allows us to avoid rewriting existing tools like `seqtk` to JavaScript, and gives us a significant speedup over running it in JavaScript:

![Performance optimization](https://res.cloudinary.com/indysigner/image/fetch/f_auto,q_auto/w_1600/https://cloud.netlifyusercontent.com/assets/344dbf88-fdf9-42bb-adb4-46f01eedd629/41d4b2ef-fa85-4a1f-ba23-f4abbbf44ac4/webassembly-speed-web-app6.png)

For details, check out my [Smashing Magazine article](https://www.smashingmagazine.com/2019/04/webassembly-speed-web-app/).
