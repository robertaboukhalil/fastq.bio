# fastq.bio
An interactive web tool that generates quality reports from DNA sequencing data without leaving the browser, powered by WebAssembly.

![Screenshot](https://fastq.sandbox.bio/assets/img/screenshot1.png)

![Screenshot](https://fastq.sandbox.bio/assets/img/screenshot2.png)


## How to use fastq.bio

You can use the hosted version at [fastq.bio](http://fastq.bio).

Or, to run fastq.bio locally:

```bash
npm install
npm run dev
```

and open the URL specified on the command line (e.g. http://localhost:5000).

## How it works

- To generate the QC report, fastq.bio runs the C tool [fastp](https://github.com/OpenGene/fastp) directly in the browser using WebAssembly. For details about the compilation from C to WebAssembly, see the [biowasm](https://github.com/biowasm/biowasm) project.
- fastq.bio uses the [aioli](https://github.com/biowasm/aioli) library to run the WebAssembly module in a WebWorker, and handles mounting user files to a virtual file system.
- For details about how WebAssembly can in some cases be a powerful tool for speeding up web apps, see [my Smashing Magazine article](https://www.smashingmagazine.com/2019/04/webassembly-speed-web-app/).
