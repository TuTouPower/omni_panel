import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SelfSignedCert {
    readonly key: string;
    readonly cert: string;
    readonly certPath: string;
    readonly tempDir: string;
}

export function generateSelfSignedCert(): SelfSignedCert {
    const tempDir = mkdtempSync(join(tmpdir(), "omni-tls-"));
    const keyPath = join(tempDir, "key.pem");
    const certPath = join(tempDir, "cert.pem");

    try {
        execFileSync(
            "openssl",
            [
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                keyPath,
                "-out",
                certPath,
                "-days",
                "365",
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost,IP:127.0.0.1",
            ],
            { stdio: "pipe" },
        );
    } catch (err) {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            /* ignore cleanup failure */
        }
        throw err;
    }

    return {
        key: readFileSync(keyPath, "utf8"),
        cert: readFileSync(certPath, "utf8"),
        certPath,
        tempDir,
    };
}
