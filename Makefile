
all:
	# Install dependencies
	npm install .
	# Compile seqtk to WASM
	emcc seqtk/seqtk.c \
		-s USE_ZLIB=1 \
		-s FORCE_FILESYSTEM=1 \
		-s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
		-s WASM=1 \
		-o wasm/seqtk.js
