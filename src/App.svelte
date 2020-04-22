<script>
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { Aioli } from "@biowasm/aioli";
import Parameter from "./Parameter.svelte";

// =====

let showExtraParams = false;

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
	minReadLength: 15,
	
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
		enabled: true,
		value: OPTIONS.trimFrontR1
	},
	"trim_front2": {
		enabled: true,
		value: OPTIONS.trimFrontR2
	},
	"trim_tail1": {
		enabled: true,
		value: OPTIONS.trimTailR1
	},
	"trim_tail2": {
		enabled: true,
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

$: console.log(PARAMS);


// ====
let files = [];
let fastp = new Aioli("fastp/0.20.1");

// Initialize fastp and output the version
fastp
	.init()
	.then(() => {
		return fastp.exec("--version");
	})
	// .then(d => {
	// 	// console.log(d.stderr);
	// 	// fastp.exec("--help")
	// 	//  .then(d => console.log(d.stderr));
	// 	// fastp.ls("/fastp/testdata/").then(d => console.log(d))
	// 	// fastp.exec("--json --in1 /fastp/testdata/R1.fq --out1 /tmp/wat.json")
	// 	fastp.exec("-i /fastp/testdata/R1.fq -o /tmp/wat.fq -w 1 --reads_to_process 1000")
	// 		 .then(d => {
	// 			//  fastp.ls("/").then(console.log)
	// 			//  fastp.cat("/fastp.json").then(d => console.log(JSON.parse(d)))
	// 			fastp.download("/fastp.html").then(url => {
	// 				document.getElementById('wat').innerHTML = `<a target="_blank" href="${url}">sdsf</a>`;
	// 			});
	// 		 });

	// });

// When a user selects a FASTA/Q file from their computer,
// sample random files and get stats
// function loadFile(event)
// {
// 	Aioli
// 		// First mount the file
// 		.mount(event.target.files[0])
// 		// Once it's mounted, run seqtk view
// 		.then(file => seqtk.exec(`view -q20 ${file.path}`))
// 		// Capture output
// 		.then(d => console.log(d.stdout));
// }

// $: for(let file of files) {
// 	Aioli
// 		// First mount the file
// 		.mount(file)
// 		// Once it's mounted, run fastp on it
// 		.then(file => seqtk.exec(`comp ${file.path}`))
// 		// Capture output
// 		.then(d => {
// 			console.log(d.stdout);
// 			console.log(d.stderr);
// 		});
// }


onMount(async () => {
  jQuery('[data-toggle="popover"]').popover()
});

</script>

<style>
h6 {
	padding-bottom: 5px;
	border-bottom: 1px solid #eee;
}

</style>

<nav class="navbar navbar-expand-md navbar-dark fixed-top bg-dark">
	<a class="navbar-brand" href="/">fastp.js</a>
	<div class="collapse navbar-collapse" id="navbarsExampleDefault">
		<ul class="navbar-nav mr-auto"></ul>
		<ul class="navbar-nav ">
			<li class="nav-item active">
				<a class="nav-link" href="#">Code</a>
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
			<div class="col-md-4">
				<h4 class="mb-4">Step 1: Choose files</h4>
				<div class="custom-file">
					<input type="file" class="custom-file-input" id="customFile" bind:files={files} accept=".fq,.fastq,.fq.gz,.fastq.gz" multiple>
					<label class="custom-file-label" for="customFile">Choose FASTQ files</label>
				</div>
				<p class="text-center mt-2">
					or use a
					<button on:click={() => files = [{'name':'sample'}]} type="button" class="btn btn-link p-0" style="vertical-align: baseline">
						<strong>sample FASTQ</strong>
					</button>
					file
				</p>
				<hr />
				{#each files as file}
					<p>{file.name}</p>
				{/each}
			</div>



			<div class="col-md-4">
				<h4 class="mb-4">Step 2: Parameters</h4>

					<h6>General</h6>
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

					{#if showExtraParams}
					<div transition:fade={{ duration: 200 }}>
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
					{/if}
			</div>




			<div class="col-md-4">
				<h4 class="mb-4">Step 3: Run!</h4>

				<h6>Fastp Parameters:</h6>
				<code>
				{#each Object.keys(PARAMS) as param}
					{#if PARAMS[param].enabled }
					--{param} {PARAMS[param].value}<br />
					{/if}
				{/each}
				</code>

				<br />

				<p><a class="btn btn-lg btn-primary col-md-12" href="#" role="button">Run analysis &raquo;</a></p>
			</div>


		</div>
	</div>
</main>

