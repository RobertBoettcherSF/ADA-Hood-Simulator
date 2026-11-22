# How we got here

## Step 1: skeleton page (v0.1.0)

- The core is one package, `Hood.Host_ABI`, with integer-only exports: `hs_build_id`, `hs_state_hash`, `hs_crash_test`, `hs_error_file_length`, `hs_error_file_char`. The host provides one import, `hs_host_error (code, line)`.
- The browser runtime of AdaWebPack has no exception propagation and the wasm build uses `-gnatp`, so a stop is an explicit `raise`. GNAT turns it into a call of `__gnat_last_chance_handler (file, line)`. `src/wasm/hood-last_chance.adb` replaces that handler in the browser build only: it keeps the Ada file name, then calls `hs_host_error` with the pending code and the line. The host reads the file name one character at a time through `hs_error_file_char`, so the interface stays integer-only.
- The native smoke build uses the normal GNAT runtime, so the same `raise` becomes `Program_Error` with the message `file:line explicit raise`; the smoke test prints it, and the page must show the same file and line.
- `hs_state_hash` is a placeholder until the world exists: FNV-1a (32 bit) over the four bytes of seed 1932. The smoke test recomputes it independently.
- `hs_build_id` is the build time as `YYDDDHHMM` (Europe/Berlin), so it fits in 32 bits; `build.sh` writes it, with the stamp, into the generated `obj/gen/hood-version.ads`.
- New constants (all proposed): version 0.1.0; build id format `YYDDDHHMM`; error codes 1 bounds, 2 range, 3 unexpected state, 4 crash test; hash seed 1932; 1 MiB stack; 32 MiB initial memory.
