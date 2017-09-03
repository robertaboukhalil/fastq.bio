#!/bin/bash

curl \
  -X POST \
  --data-urlencode "input=$(cat fastq.bio.js)" \
  "https://javascript-minifier.com/raw" > fastq.bio.min.js

