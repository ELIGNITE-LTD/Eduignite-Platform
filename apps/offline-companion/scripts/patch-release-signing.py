#!/usr/bin/env python3
"""Inject a release signingConfig into the Capacitor-generated android build.gradle.

The android/ project is scaffolded fresh in CI (`npx cap add android`), so the
signing config can't be committed. This patches the generated file to read the
keystore path/passwords from environment variables at build time. Run from
apps/mobile after `npx cap sync android`.
"""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "android/app/build.gradle"
src = open(path).read()

if "signingConfigs" in src and "System.getenv(\"ANDROID_KEYSTORE_PATH\")" in src:
    print("build.gradle already patched; skipping")
    sys.exit(0)

signing_block = """
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
"""

# Insert the signingConfigs block just inside the first `android {`.
new_src, n = re.subn(r"android\s*\{", "android {\n" + signing_block, src, count=1)
if n != 1:
    sys.exit("could not find `android {` block in " + path)

# Point the release buildType at the new signing config.
new_src, n = re.subn(
    r"(buildTypes\s*\{\s*release\s*\{)",
    r"\1\n            signingConfig signingConfigs.release",
    new_src,
    count=1,
)
if n != 1:
    sys.exit("could not find release buildType in " + path)

open(path, "w").write(new_src)
print("build.gradle patched for release signing")
