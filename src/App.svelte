<script>
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { Aioli } from "@biowasm/aioli";
import Parameter from "./Parameter.svelte";


// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------

let FILES = [];							// Files uploaded by user
let REPORTS = [];						// Reports output by fastp
let FASTP = new Aioli("fastp/0.20.1");	// Fastp command line tool (compiled to WebAssembly)


// -----------------------------------------------------------------------------
// Fastp parameters
// -----------------------------------------------------------------------------

let OPTIONS = {
	nbReads: 5000,
	trimAdapters: "",
	trimAdaptersR1: "",
	trimAdaptersR2: "",
	trimFrontR1: 0,
	trimFrontR2: 0,
	trimTailR1: 0,
	trimTailR2: 0,
	trimPolyX: "",
	trimPolyXLength: 10,
	minMapQ: 15,
	minQualifiedBases: 40,
	minReadLength: 15
};

$: PARAMS = {
	"reads_to_process": {
		enabled: true,
		value: OPTIONS.nbReads
	},
	"disable_adapter_trimming": {
		enabled: OPTIONS.trimAdapters !== true,
		value: ""
	},
	"adapter_sequence": {
		enabled: OPTIONS.trimAdapters === true && OPTIONS.trimAdaptersR1 != "",
		value: OPTIONS.trimAdaptersR1
	},
	"adapter_sequence_r2": {
		enabled: OPTIONS.trimAdapters === true && OPTIONS.trimAdaptersR2 != "",
		value: OPTIONS.trimAdaptersR2
	},
	"trim_front1": {
		enabled: OPTIONS.trimFrontR1 > 0,
		value: OPTIONS.trimFrontR1
	},
	"trim_front2": {
		enabled: OPTIONS.trimFrontR2 > 0,
		value: OPTIONS.trimFrontR2
	},
	"trim_tail1": {
		enabled: OPTIONS.trimTailR1 > 0,
		value: OPTIONS.trimTailR1
	},
	"trim_tail2": {
		enabled: OPTIONS.trimTailR2 > 0,
		value: OPTIONS.trimTailR2
	},
	"trim_poly_x": {
		enabled: OPTIONS.trimPolyX === true,
		value: ""
	},
	"poly_x_min_len": {
		enabled: OPTIONS.trimPolyX === true && OPTIONS.trimPolyXLength != "",
		value: OPTIONS.trimPolyXLength
	},
	"qualified_quality_phred": {
		enabled: true,
		value: OPTIONS.minMapQ
	},
	"unqualified_percent_limit": {
		enabled: true,
		value: OPTIONS.minQualifiedBases
	},
	"length_required": {
		enabled: true,
		value: OPTIONS.minReadLength
	}
}

// Generate CLI parameters from user input
$: PARAMS_CLI = Object.entries(PARAMS)
	.filter(d => d[1].enabled)
	.map(d => `--${d[0]} ${d[1].value}`);

// Pair up FASTQ files based on file names
$: FILES_PAIRED = getFastqPairs(FILES);


// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

function deleteFile(file)
{
	FILES = Array.from(FILES).filter(f => f.name != file.name);
}


function getFastqPairs(filelist)
{
	let result = [];
	// Convert from FileList to array
	let files = Array.from(filelist);
	// Natural sort (https://stackoverflow.com/a/38641281)
	files.sort((a, b) => a.name.localeCompare(b.name, undefined, {
		numeric: true,
		sensitivity: 'base'
	}));

	// Check for matching FASTQ pairs by file name
	while(files.length > 0)
	{
		// Check for valid FASTQ patterns
		let file = files.shift();
		let matchedPair = false;
		if(files[0] != null)
			for(let pattern of [{ r1: "R1", r2: "R2" }, { r1: "_1", r2: "_2" }])
				if(file.name.includes(pattern.r1) && file.name.replace(pattern.r1, pattern.r2) == files[0].name) {
					let fileNext = files.shift();
					result.push([ file, fileNext ]);
					matchedPair = true;
					break;
				}
		// If didn't match, then it's a singleton
		if(!matchedPair)
			result.push([ file ]);
	}

	return result;
}


function getCLIOutputPath(files)
{
	return `${files[0].path.replace("/data", "/tmp")}`;
}


function getCLIOptions(files)
{
	let command = ` ${PARAMS_CLI.join(" ")} --html ${getCLIOutputPath(files)}.html --json ${getCLIOutputPath(files)}.json --in1 ${files[0].path} `;
	if(files[1] != null)
		command += ` --in2 ${files[1].path} `;
	return command;
}


// Launch the fastp analysis on selected files
function runAnalysis()
{
	showAnalysisBtn = false;

	// CLI parameters we'll use for all files
	let paramsShared = PARAMS_CLI.join(" ");

	// Process each file
	let promises = [];
	for(let filePair of FILES_PAIRED)
	{
		// TODO: support sample FASTQ file
		// if(file instanceof File)

		// Mount files
		let filesMounted = [];
		let promisesMount = filePair.map(file => Aioli.mount(file));
		let promise = Promise.all(promisesMount)
			// Once files mounted, run fastp with user-specified settings
			.then(files => { filesMounted = files; return FASTP.exec(`${getCLIOptions(filesMounted)}`); })
			// Once done, download the .html file as a URL
			.then(d => FASTP.download(`${getCLIOutputPath(filesMounted)}.html`))
			// Push that URL to the UI
			.then(url => REPORTS = [...REPORTS, { url: url, name: filesMounted[0].name }])
		promises.push(promise);
	}

	// Once all files are processed, hide spinner
	Promise.all([promises]).then(values => showAnalysisBtn = true);
}


// -----------------------------------------------------------------------------
// On page load
// -----------------------------------------------------------------------------

onMount(async () => {
	// Initialize fastp and output the version
	FASTP.init()
		.then(() => FASTP.exec("--version"))
		.then(d => {
			showAnalysisBtn = true;
			console.log(d.stderr);
		});

	// Enable jQuery tooltips
	jQuery("[data-toggle='popover']").popover();
});


// -----------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------

let showExtraParams = false;
let showAnalysisBtn = false;
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
	<a class="navbar-brand" href="/">fastp.js</a>
	<div class="collapse navbar-collapse" id="navbarsExampleDefault">
		<ul class="navbar-nav mr-auto"></ul>
		<ul class="navbar-nav">
			<li class="nav-item active">
				<a class="nav-link" href="/">Code</a>
			</li>
		</ul>
	</div>
</nav>

<main role="main">
	<div class="jumbotron mt-5 pb-4">
		<div class="container">
			<h1 class="display-5">&#x1f9ec;&nbsp; Peek at Your Sequencing Data</h1>
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
					<input type="file" class="custom-file-input" id="customFile" bind:files={FILES} accept=".fq,.fastq,.gz" multiple>
					<label class="custom-file-label" for="customFile">Click here to select files</label>
				</div>
				<p class="text-center mt-2">
					or use a
					<button on:click={() => FILES = [{'name':'sample'}]} type="button" class="btn btn-link p-0" style="vertical-align: baseline">
						<strong>sample FASTQ</strong>
					</button>
					file
				</p>
				<hr />
				{#each FILES_PAIRED as filePair}
					<div class="card mb-2">
						<div class="card-body">
							{#each filePair as file}
								<button on:click={() => deleteFile(file)} type="button" class="btn btn-link p-0" style="vertical-align: baseline">
									<strong>X</strong>
								</button>
								{file.name}<br />
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Parameters -->
			<div class="col-md-4">
				<h4 class="mb-4">Step 2: Parameters</h4>

				<h6>General Settings</h6>
				<Parameter label="#Reads to Analyze" type="text" bind:value={OPTIONS.nbReads} />
				<Parameter label="Min Read Length" type="text" bind:value={OPTIONS.minReadLength} append="bp" />
				<Parameter label="Min Base Quality" type="text" bind:value={OPTIONS.minMapQ} prepend="Q" help="Mark a base as low quality if it has a Phred score < Q{OPTIONS.minMapQ}" />
				<Parameter label="Max Low Qual Bases" type="text" bind:value={OPTIONS.minQualifiedBases} append="%" help="Filter out reads where over {OPTIONS.minQualifiedBases}% of bases are low quality (i.e. Phred scores <Q{OPTIONS.minMapQ})" />
				<br />

				<p class="text-center mt-2">
					<button on:click={() => showExtraParams = !showExtraParams} type="button" class="btn btn-link p-0" style="vertical-align: baseline">
						<strong>{showExtraParams ? "Fewer" : "More"} settings</strong>
					</button>
				</p>

				<div class={showExtraParams ? "" : "d-none"} transition:fade={{ duration: 200 }}>
					<h6>3' end trimming <small>(Optional)</small></h6>
					<Parameter label="Trim PolyX" type="checkbox" bind:value={OPTIONS.trimPolyX} help="Enable trimming of polyA/C/G/T tails" />
					<Parameter label="PolyX min length" type="text" append="bp" bind:value={OPTIONS.trimPolyXLength} disabled={!OPTIONS.trimPolyX} help="Minimum length of PolyX tail at 3' end" />
					<br />

					<h6>Read Trimming <small>(Optional)</small></h6>
					<Parameter label="Trim 5' end of R1" type="text" append="bp" bind:value={OPTIONS.trimFrontR1} help="Trim {OPTIONS.trimFrontR1}bp from the 5' end of R1" />
					<Parameter label="Trim 3' end of R1" type="text" append="bp" bind:value={OPTIONS.trimTailR1} help="Trim {OPTIONS.trimTailR1}bp from the 3' end of R1" />
					<Parameter label="Trim 5' end of R2" type="text" append="bp" bind:value={OPTIONS.trimFrontR2} help="Trim {OPTIONS.trimFrontR2}bp from the 5' end of R2" />
					<Parameter label="Trim 3' end of R2" type="text" append="bp" bind:value={OPTIONS.trimTailR2} help="Trim {OPTIONS.trimTailR2}bp from the 3' end of R2" />
					<br />

					<h6>Adapter Trimming <small>(Optional)</small></h6>
					<Parameter label="Trim Adapters" type="checkbox" bind:value={OPTIONS.trimAdapters} help="Enable adapter trimming" />
					<Parameter label="Adapters R1" type="text" bind:value={OPTIONS.trimAdaptersR1} disabled={!OPTIONS.trimAdapters} help="Adapter sequence for Read 1. If no adapters are specified, they are auto-detected for single-end reads" />
					<Parameter label="Adapters R2" type="text" bind:value={OPTIONS.trimAdaptersR2} disabled={!OPTIONS.trimAdapters} help="Adapter sequence for Read 2" />
					<br />
				</div>

				<h6>Fastp Parameters:</h6>
				<code>
				{#each PARAMS_CLI as param}
					{param}<br />
				{/each}
				</code>
			</div>

			<!-- Launch analysis -->
			<div class="col-md-4">
				<h4 class="mb-4">Step 3: Run!</h4>
				<p><button class="btn btn-lg btn-primary col-md-12" on:click={runAnalysis} disabled={!showAnalysisBtn}>Run analysis &raquo;</button></p>

				<hr />

				{#each REPORTS as report}
					<div class="card mb-2">
						<div class="card-body">
							<p>{report.name}</p>
							<a target="_blank" href={report.url} class="btn btn-sm btn-primary">Open Report</a>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</main>
