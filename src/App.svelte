<script>
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { Aioli } from "@biowasm/aioli";
import Parameter from "./Parameter.svelte";


// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------

let FILES = [];		// Files uploaded by user
let REPORTS = [];	// Reports output by fastp


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


// -----------------------------------------------------------------------------
// 
// -----------------------------------------------------------------------------

// Initialize fastp and output the version
let fastp = new Aioli("fastp/0.20.1");
fastp
	.init()
	.then(() => fastp.exec("--version"))
	.then(d => console.log(d.stderr));


// Launch the fastp analysis on selected files
function runAnalysis()
{
	showSpinner = true;

	// CLI parameters we'll use for all files
	let sharedParams = PARAMS_CLI.join(" ");

	// Process each file
	let promises = [];
	for(let file of FILES)
	{
		// TODO: support sample FASTQ file
		if(file instanceof File)
		{
			let promise = Aioli.mount(file)
				// Once file is mounted, run fastp on it
				.then(f => fastp.exec(`${sharedParams} --in1 ${f.path} --html /tmp/wat.html`))
				// Download the report as a URL
				.then(d => fastp.download("/tmp/wat.html"))
				// Add URL to the list of reports
				.then(url => REPORTS = [...REPORTS, { url: url, name: file.name }]);
			promises.push(promise);
		}
	}

	// Once all files are processed, hide spinner
	Promise.all([promises]).then(values => showSpinner = false);
}


// -----------------------------------------------------------------------------
// On page load
// -----------------------------------------------------------------------------

// Enable jQuery tooltips
onMount(async () => jQuery("[data-toggle='popover']").popover());


// -----------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------

let showExtraParams = false;
let showSpinner = false;
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
					<input type="file" class="custom-file-input" id="customFile" bind:files={FILES} accept=".fq,.fastq,.fq.gz,.fastq.gz" multiple>
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
				{#each FILES as file}
					<p>{file.name}</p>
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
				<p><button class="btn btn-lg btn-primary col-md-12" on:click={runAnalysis} disabled={showSpinner}>Run analysis &raquo;</button></p>

				<hr />

				{#each REPORTS as report}
					<a target="_blank" href={report.url}>{report.name}</a>
				{/each}
			</div>
		</div>
	</div>
</main>
