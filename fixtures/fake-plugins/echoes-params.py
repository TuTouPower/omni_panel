import json, sys
params = {}
i = 1
while i < len(sys.argv):
    if sys.argv[i] == "--usageboard-param" and i + 1 < len(sys.argv):
        kv = sys.argv[i + 1]
        if "=" in kv:
            key, value = kv.split("=", 1)
            params[key] = value
        i += 2
    else:
        i += 1
print(json.dumps({"echoed": params}))
