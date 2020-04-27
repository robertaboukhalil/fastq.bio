<script>
import { onMount } from "svelte";
import { Aioli } from "@biowasm/aioli";

import * as utils from "./utils.js";
import Parameter from "./Parameter.svelte";


// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------

let Files = [];							// Files uploaded by user
let FilesPaired = [];					// Array of arrays of paired FASTQ files (R1/R2 or _1/_2)
let Reports = [];						// Reports output by fastp
let Fastp = new Aioli("fastp/0.20.1");	// Fastp command line tool (compiled to WebAssembly)
let Params = [];						// Fastp CLI parameters - Array
let ParamsCLI = "";						// Fastp CLI parameters - String
let UI = {								// General UI Options
	busy: true,
	showExtraParams: false
}
let Options = {							// Fastp UI Options
	nbReads: 5000,
	minMapQ: 15,
	minQualifiedBases: 40,
	minReadLength: 15,
	trimAdapters: "",
	trimAdaptersR1: "",
	trimAdaptersR2: "",
	trimFrontR1: 0,
	trimFrontR2: 0,
	trimPolyX: "",
	trimPolyXLength: 10,
	trimTailR1: 0,
	trimTailR2: 0
};


// -----------------------------------------------------------------------------
// Reactive statements
// -----------------------------------------------------------------------------

// Pair up FASTQ files based on file names
$: FilesPaired = utils.getFastqPairs(Files);

// Convert UI options to CLI parameters
$: Params = utils.getParams(Options);

// Generate CLI parameters from user input
$: ParamsCLI = Object.entries(Params)
	.filter(d => d[1].enabled)
	.map(d => `--${d[0]} ${d[1].value}`);


// -----------------------------------------------------------------------------
// Launch the fastp analysis on selected files
// -----------------------------------------------------------------------------

async function runAnalysis()
{
	UI.busy = true;

	// Process file pairs
	for(let files of FilesPaired)
	{
		// Mount files (skip that part if we're processing the sample FASTQ)
		if(files[0] instanceof File)
			files = await Promise.all(files.map(f => Aioli.mount(f)));

		// Construct fastp command
		let output = `--html ${utils.getOutputPath(files)}.html --json ${utils.getOutputPath(files)}.json`
		let command = `${ParamsCLI.join(" ")} ${output} --in1 ${files[0].path} `;
		if(files[1] != null)
			command += `--in2 ${files[1].path}`;

		// Run fastp with user settings
		await Fastp.exec(command);

		// Get path of HTML output file
		let url = await Fastp.download(`${utils.getOutputPath(files)}.html`);
		Reports = [...Reports, { url: url, name: files[0].name }]
	}

	UI.busy = false;
}

// Load the HTML report in a new tab.
// Note that just doing <a href="<url>" target="_blank"> is blocked by AdBlockers...
function loadReport(url)
{
	let newTab = window.open("/loading.html");
	newTab.onload = () => newTab.location = url;
}


// -----------------------------------------------------------------------------
// On page load
// -----------------------------------------------------------------------------

onMount(async () => {
	// Initialize fastp and output the version
	Fastp.init()
		.then(() => Fastp.exec("--version"))
		.then(d => {
			UI.busy = false;
			console.log(d.stderr);
		});

	// Enable jQuery tooltips
	jQuery("[data-toggle='popover']").popover();
});


// -----------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------
</script>

<style>
h6 {
	padding-bottom: 5px;
	border-bottom: 1px solid #eee;
}

code {
	line-height: 1.1;
}
</style>

<nav class="navbar navbar-expand-md navbar-dark fixed-top bg-dark">
	<a class="navbar-brand" href="/">fastq.bio</a>
	<div class="collapse navbar-collapse" id="navbarsExampleDefault">
		<ul class="navbar-nav mr-auto"></ul>
		<ul class="navbar-nav">
			<li class="nav-item active">
				<a class="nav-link" href="https://github.com/robertaboukhalil/fastq.bio">Code</a>
			</li>
		</ul>
	</div>
</nav>

<main role="main">
	<div class="jumbotron mt-4 pb-3">
		<div class="container">
			<h2 class="display-5">&#x1f9ec;&nbsp; Peek at Your Sequencing Data</h2>
			<p class="lead">Quickly generate data quality reports for FASTQ files. Your data never leaves the browser.</p>
		</div>
	</div>

	<div class="container">
		<div class="row">
			<!-- Choose files -->
			<div class="col-md-4">
				<h4 class="mb-4">Step 1: Choose files</h4>

				<h6>Choose FASTQ files to analyze</h6>
				<div class="custom-file mb-2">
					<input type="file" class="custom-file-input" id="customFile" bind:files={Files} accept=".fq,.fastq,.gz" multiple>
					<label class="custom-file-label" for="customFile">Click here to select files</label>
				</div>
				<p class="text-center mt-2">
					or use
					<button 
						type="button" class="btn btn-link p-0" style="vertical-align: baseline"
						on:click={() => Files = [
							{ name: "NA12878.fastq.gz", path: "/fastp/testdata/NA12878.fastq.gz" },
							{ name: "Sample FASTQ - R1", path: "/fastp/testdata/R1.fq" },
							{ name: "Sample FASTQ - R2", path: "/fastp/testdata/R2.fq" },
						]}
					>
						<strong>sample FASTQ files</strong>
					</button>
				</p>
				<hr />
				{#each FilesPaired as filePair}
					<div class="card mb-2">
						<div class="card-body">
							{#each filePair as file}
								<button
									type="button" class="btn btn-sm btn-light"
									on:click={() => Files = Array.from(Files).filter(f => f.name != file.name)}
								>
									<strong>&#x2716;</strong>
								</button>
								{file.name}<br />
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Parameters -->
			<div class="col-md-4">
				<h4 class="mb-4">Step 2: Set Parameters</h4>

				<h6>General Settings</h6>
				<Parameter label="#Reads to Analyze" type="text" bind:value={Options.nbReads} />
				<Parameter label="Min Read Length" type="text" bind:value={Options.minReadLength} append="bp" />
				<Parameter label="Min Base Quality" type="text" bind:value={Options.minMapQ} prepend="Q" help="Mark a base as low quality if it has a Phred score < Q{Options.minMapQ}" />
				<Parameter label="Max Low Qual Bases" type="text" bind:value={Options.minQualifiedBases} append="%" help="Filter out reads where over {Options.minQualifiedBases}% of bases are low quality (i.e. Phred scores <Q{Options.minMapQ})" />
				<br />

				<p class="text-center mt-2">
					<button on:click={() => UI.showExtraParams = !UI.showExtraParams} type="button" class="btn btn-link p-0" style="vertical-align: baseline">
						<strong>{UI.showExtraParams ? "Fewer" : "More"} settings</strong>
					</button>
				</p>

				<div class={UI.showExtraParams ? "" : "d-none"}>
					<h6>3' end trimming <small>(Optional)</small></h6>
					<Parameter label="Trim PolyX" type="checkbox" bind:value={Options.trimPolyX} help="Enable trimming of polyA/C/G/T tails" />
					<Parameter label="PolyX min length" type="text" append="bp" bind:value={Options.trimPolyXLength} disabled={!Options.trimPolyX} help="Minimum length of PolyX tail at 3' end" />
					<br />

					<h6>Read Trimming <small>(Optional)</small></h6>
					<Parameter label="Trim 5' end of R1" type="text" append="bp" bind:value={Options.trimFrontR1} help="Trim {Options.trimFrontR1}bp from the 5' end of R1" />
					<Parameter label="Trim 3' end of R1" type="text" append="bp" bind:value={Options.trimTailR1} help="Trim {Options.trimTailR1}bp from the 3' end of R1" />
					<Parameter label="Trim 5' end of R2" type="text" append="bp" bind:value={Options.trimFrontR2} help="Trim {Options.trimFrontR2}bp from the 5' end of R2" />
					<Parameter label="Trim 3' end of R2" type="text" append="bp" bind:value={Options.trimTailR2} help="Trim {Options.trimTailR2}bp from the 3' end of R2" />
					<br />

					<h6>Adapter Trimming <small>(Optional)</small></h6>
					<Parameter label="Trim Adapters" type="checkbox" bind:value={Options.trimAdapters} help="Enable adapter trimming" />
					<Parameter label="Adapters R1" type="text" bind:value={Options.trimAdaptersR1} disabled={!Options.trimAdapters} help="Adapter sequence for Read 1. If no adapters are specified, they are auto-detected for single-end reads" />
					<Parameter label="Adapters R2" type="text" bind:value={Options.trimAdaptersR2} disabled={!Options.trimAdapters} help="Adapter sequence for Read 2" />
					<br />
				</div>

				<h6>Fastp Parameters:</h6>
				<code>
				{#each ParamsCLI as param}
					{param}<br />
				{/each}
				</code>
			</div>

			<!-- Launch analysis -->
			<div class="col-md-4">
				<h4 class="mb-4">Step 3: Run!</h4>
				<p><button class="btn btn-lg btn-primary col-md-12" on:click={runAnalysis} disabled={UI.busy}>Run analysis &raquo;</button></p>

				<hr />

				{#each Reports as report}
					<div class="card mb-2">
						<div class="card-body">
							<p>{report.name}</p> 
							<button class="btn btn-sm btn-primary" on:click={d => loadReport(report.url)}>Open Report</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</main>
