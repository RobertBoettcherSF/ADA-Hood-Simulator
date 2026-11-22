#!/bin/sh
# Opt-in, one time: downloads AdaWebPack 24 (GNAT-LLVM, Ada -> WebAssembly)
# into $ADAWEBPACK (default ~/toolchains/adawebpack-24). About 58 MB, plus the
# GNAT 14 runtime library through alr if this machine does not have it.
# build.sh never runs this script.
# Needs once:  sudo apt install rpm2cpio cpio lld libedit2   (and alr for GNAT 14)
set -e
A=${ADAWEBPACK:-$HOME/toolchains/adawebpack-24}
if [ -x "$A/usr/bin/llvm-gcc" ]; then
  echo "AdaWebPack 24 is already in $A"
  exit 0
fi
printf "Download AdaWebPack 24 (about 58 MB) into %s? [y/N] " "$A"
read -r ANSWER
case "$ANSWER" in y|Y|yes) ;; *) echo "Nothing downloaded."; exit 1 ;; esac
mkdir -p "$A" && cd "$A"
F=https://archives.fedoraproject.org/pub/archive/fedora/linux/releases/40/Everything/x86_64/os/Packages
for U in https://github.com/godunko/adawebpack/releases/download/24.0.0/adawebpack-24.0.0-git.fc40.x86_64.rpm \
         $F/l/llvm16-libs-16.0.6-7.fc40.x86_64.rpm \
         $F/c/clang16-libs-16.0.6-5.fc40.x86_64.rpm; do
  echo "Downloading $U"; curl -sSL "$U" | rpm2cpio | cpio -idm --quiet
done
mkdir -p lib
cp usr/lib64/llvm16/lib/libLLVM-16.so usr/lib64/llvm16/lib/libclang-cpp.so.16 lib/
[ -e /usr/lib/x86_64-linux-gnu/libedit.so.0 ] || ln -sf /usr/lib/x86_64-linux-gnu/libedit.so.2 lib/libedit.so.0
# The compiler itself is written in Ada and needs the GNAT 14 runtime library.
if ! ldconfig -p | grep -q libgnat-14.so; then
  alr -n install --prefix="$PWD/gnat14" gnat_native=14.2.1
  cp "$(find gnat14 -name libgnat-14.so | head -1)" lib/
fi
rm -rf usr/lib64 gnat14
echo "AdaWebPack 24 ready in $A"
