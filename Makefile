
all:
	# Setup submodules
	git submodule update --init
	# Install dependencies
	npm install .
	# Compile seqtk to WASM
	mkdir -p wasm/
	emcc seqtk/seqtk.c \
		-s USE_ZLIB=1 \
		-s FORCE_FILESYSTEM=1 \
		-s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "callMain"]' \
		-s WASM=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-o wasm/seqtk.js
