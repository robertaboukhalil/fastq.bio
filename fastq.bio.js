// FASTQ Module
var FASTQ = (function()
{
    // =========================================================================
    // Config
    // =========================================================================
    var _fastqRegex  = /.fastq|.fq|.fastq.gz|.fq.gz/,
        _fastqBytes  = 1024 * 500,
        _fastqLines  = 10000, _fastqLinesOrig = 10000,
        _fastqPhred  = 33,
        _fastqPtr    = {}, // pointer to current byte position; key = filename
        _fastqStats  = {}, // stats; key = filename
        _fastqN      = {}, // number of times read chunk; key = filename
        _fastqSample = {}, // sample first or random reads (label on plots); key = filename
        _fastqVisited= {}; // reads already visited; key = filename

    function reset() {
        _fastqLines  = _fastqLinesOrig;
        _fastqPtr    = {};
        _fastqStats  = {};
        _fastqN      = {};
    }

    // =========================================================================
    // Validate a FASTQ file
    // =========================================================================
    // Check if file has valid file name
    function isValidFileName(file) {
        return file != null && "name" in file && file.name.match(_fastqRegex);
    }

    // Check if file chunk is valid FASTQ
    function isValidChunk(file, chunk)
    {
        if(!isValidFileName(file))
            return false;

        // Valid FASTQ:
        // - Header line must start with @
        // - Sequence and quality lines must be of equal lengths
        return chunk[0].match(/^@/) && chunk[1].length == chunk[3].length;
    }

    // =========================================================================
    // Parse chunks
    // =========================================================================

    // -------------------------------------------------------------------------
    // Get next FASTQ chunk
    // -------------------------------------------------------------------------
    function getNextChunk(file, maxN, callbacks)
    {
        // Initialize
        if(!(file.name in _fastqPtr)) {
            _fastqPtr[file.name] = 0;
            _fastqStats[file.name] = null;
            _fastqN[file.name] = 0;
            _fastqVisited[file.name] = [];
        }
        // If gzip, reset stats since need to read from beginning
        var isGzip = file.name.match(/.gz$/);
        if(isGzip) {
            _fastqStats[file.name] = null;
            _fastqSample[file.name] = "first";
        }

        // Keep track of number of times sampled the file
        if(_fastqN[file.name] > maxN) {
            if("lastread" in callbacks)
                callbacks["lastread"]();
            return;
        }
        _fastqN[file.name]++;

        // Variables
        var reader    = new FileReader(),
            callbacks = callbacks || {};

        // If gzip, need to start reading from beginning
        if(isGzip) {
            startPos    = 0;
            endPos      = _fastqBytes * _fastqN[file.name] / 4; // gzip ~ 4x compression?
            _fastqLines = _fastqLinesOrig * _fastqN[file.name] * 10;
        }
        // Otherwise, choose a random sampling point
        else {
            startPos = Math.floor(Math.random() * (file.size + 1));
            endPos   = Math.min(startPos + _fastqBytes, file.size);
        }

        // Callback before reading
        if("preread" in callbacks)
            callbacks["preread"]();

        // Exit if done reading file
        if(startPos >= endPos || _fastqPtr[file.name] == -1) {
            if("lastread" in callbacks)
                callbacks["lastread"]();
            return;
        }

        // Read file chunk
        console.log("[getNextChunk] Fetching bytes: " + startPos + " -> " + endPos);            
        reader.readAsBinaryString(file.slice(startPos, endPos));
        reader.onload = function(e)
        {
            var chunk = reader.result;

            // Unzip FASTQ chunk if need be
            if(isGzip)
            {
                var inflated = pako.inflate(chunk);
                if(inflated.length == 0) {
                    alert("Error: The .gz file specified has an unsupported encoding. Try unzipping the FASTQ file and re-gzipping it.");
                    _fastqPtr[file.name] = -1;
                    return;
                }
                chunk = new TextDecoder("utf-8").decode(inflated);
            }

            // Parse chunk
            parseChunk(file, chunk, startPos);
            if("postread" in callbacks)
                callbacks["postread"](_fastqStats[file.name], _fastqSample[file.name]);
        }
    }

    // -------------------------------------------------------------------------
    // Parse a FASTQ chunk
    // -------------------------------------------------------------------------
    function parseChunk(file, chunk, startPos)
    {
        var stats         = {},
            nbLines       = _fastqLines,
            statsCurr     = _fastqStats[file.name],
            visitedBytes  = startPos,
            visitedReads  = _fastqVisited[file.name],
            visitedReject = 0;

        // Load previous stats if present
        if(statsCurr == null)
            stats = {
                reads   : 0,  // number of reads
                avgGC   : [], // average GC content per read
                avgQual : [], // average quality score per read
                seqlen  : [], // sequence length per read
                nucl    : [], // for each position, nucleotide content
                qual    : []  // for each position, base quality
            };
        else
            stats = statsCurr;

        // Split by break line
        chunk = chunk.split("\n");
        // Number of lines to validate
        if(chunk.length < nbLines)
            nbLines = chunk.length - chunk.length % 4;
        nbLines -= 4; // Skip last read: Make sure it isn't clipped

        // Need at least 4 lines... otherwise skip this file
        if(nbLines < 4) {
            console.log("[parseChunk] Error: found " + nbLines + " lines.")
            _fastqPtr[file.name] = -1;
            return;
        }

        // Go to next valid FASTQ line (assume not sampling from beginning of line)
        while(!isValidChunk(file, [ chunk[0],chunk[1],chunk[2],chunk[3] ] )) {
            visitedBytes += chunk[0].length + 1;
            chunk.shift();
        }

        // Loop through each FASTQ read
        for(var i = 0; i < nbLines; i += 4)
        {
            // Detect invalid FASTQ chunk
            if(!isValidChunk(file, [ chunk[0], chunk[i+1], chunk[i+2], chunk[i+3] ])) {
                console.log("[parseChunk] Invalid FASTQ format.")
                _fastqPtr[file.name] = -1;
                return;
            }

            // Get current read's sequence and quality score lines
            var seq  = chunk[i+1],
                qual = chunk[i+3];

            // Keep track of number of reads and sequence lengths
            stats.reads++;
            stats.seqlen.push(seq.length);

            // Loop through each sequence character
            var gcSum   = 0, gcTot   = 0;
            var qualSum = 0, qualTot = 0;
            for(var j = 0; j < seq.length; j++)
            {
                // Initialize stats
                if(stats.nucl[j] == null) {
                    stats.nucl[j] = { A:0, C:0, G:0, T:0, N:0 };
                    stats.qual[j] = [];
                }

                // Get current base nucleotide + quality score
                var currNucleotide = seq[j],
                    currQualScore  = qual[j].charCodeAt() - _fastqPhred;

                // Keep track of number of bases of this kind at current read position
                stats.nucl[j][ currNucleotide ]++;
                // Keep track of quality scores at this position
                stats.qual[j].push( currQualScore )
                // Keep track of average GC content per read
                gcSum += (seq[j] == 'C' || seq[j] == 'G') ? 1 : 0;
                gcTot ++;
                // Keep track of average quality score per read
                qualSum += currQualScore;
                qualTot ++;
            }
            stats.avgGC.push( Math.round(gcSum / gcTot * 1000) / 1000 );
            stats.avgQual.push( Math.round(qualSum / qualTot) );
        }

        // Increment # reads processed
        console.log("[parseChunk] Read " + nbLines + " lines - " + stats.reads + " reads total")

        // Update stats
        _fastqStats[file.name] = stats;

        return true;
    }

    // =========================================================================
    // Public methods
    // =========================================================================
    return {
        isValidFileName: isValidFileName,
        getNextChunk: getNextChunk,
        reset: reset,
        tmp: tmp,
        tmp2: tmp2
    };
})();
