// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------

const PATTERNS_FASTQ = [{ r1: "R1", r2: "R2" }, { r1: "_1", r2: "_2" }];


// -----------------------------------------------------------------------------
// Convert an array of File/Blob objects into an array of arrays of FASTQ pairs
// e.g. [ "a_R1.fq", "a_R2.fq", "b.fq" ] --> [ ["a_R1.fq", "a_R2.fq"], ["b.fq"] ]
// -----------------------------------------------------------------------------
export function getFastqPairs(files)
{
	let result = [];
	// Convert to array of Files (in case input is a FileList object)
	files = Array.from(files);
	// Natural sort (https://stackoverflow.com/a/38641281)
	files.sort((a, b) => a.name.localeCompare(b.name, undefined, {
		numeric: true,
		sensitivity: 'base'
	}));

	// Check for matching FASTQ pairs by file name
	while(files.length > 0)
	{
		// Compare current file with the next one
		let file = files.shift();
		let matchedPair = false;
		// Check if there's a matching pattern
		if(files[0] != null)
			for(let pattern of PATTERNS_FASTQ)
				if(file.name.includes(pattern.r1) && file.name.replace(pattern.r1, pattern.r2) == files[0].name)
				{
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


// -----------------------------------------------------------------------------
// Fastp CLI utility functions
// -----------------------------------------------------------------------------

export function getOutputPath(files)
{
	return `${files[0].path.replace("/data", "/tmp")}`;
}

export function getParams(options)
{
	return {
		"reads_to_process": {
			enabled: true,
			value: options.nbReads
		},
		"disable_adapter_trimming": {
			enabled: options.trimAdapters !== true,
			value: ""
		},
		"adapter_sequence": {
			enabled: options.trimAdapters === true && options.trimAdaptersR1 != "",
			value: options.trimAdaptersR1
		},
		"adapter_sequence_r2": {
			enabled: options.trimAdapters === true && options.trimAdaptersR2 != "",
			value: options.trimAdaptersR2
		},
		"trim_front1": {
			enabled: options.trimFrontR1 > 0,
			value: options.trimFrontR1
		},
		"trim_front2": {
			enabled: options.trimFrontR2 > 0,
			value: options.trimFrontR2
		},
		"trim_tail1": {
			enabled: options.trimTailR1 > 0,
			value: options.trimTailR1
		},
		"trim_tail2": {
			enabled: options.trimTailR2 > 0,
			value: options.trimTailR2
		},
		"trim_poly_x": {
			enabled: options.trimPolyX === true,
			value: ""
		},
		"poly_x_min_len": {
			enabled: options.trimPolyX === true && options.trimPolyXLength != "",
			value: options.trimPolyXLength
		},
		"qualified_quality_phred": {
			enabled: true,
			value: options.minMapQ
		},
		"unqualified_percent_limit": {
			enabled: true,
			value: options.minQualifiedBases
		},
		"length_required": {
			enabled: true,
			value: options.minReadLength
		}
	};
}
