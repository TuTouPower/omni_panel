import json, sys
params = {}
for arg in sys.argv[1:]:
    if arg.startswith("--usageboard-param="):
        k, v = arg.split("=", 1)
        key = k.replace("--usageboard-param-", "")
        params[key] = v
print(json.dumps({"echoed": params}))
