import json, sys
params = {}
for arg in sys.argv[1:]:
    if arg.startswith("--usageboard-param="):
        rest = arg[len("--usageboard-param="):]
        if "=" in rest:
            key, value = rest.split("=", 1)
            params[key] = value
print(json.dumps({"echoed": params}))
