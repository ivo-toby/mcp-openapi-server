#!/usr/bin/env python3
import json
import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description='Send a JSON-RPC request to MCP server')
    parser.add_argument('--type', choices=['init', 'list', 'call'], required=True, help='Request type')
    parser.add_argument('--id', default=None, help='Tool ID for call request')
    parser.add_argument('--name', default=None, help='Tool name for call request')
    parser.add_argument('--param', action='append', nargs=2, metavar=('KEY', 'VALUE'), help='Parameter for call request')
    args = parser.parse_args()
    
    if args.type == 'init':
        request = {
            "jsonrpc": "2.0",
            "id": "init-1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "test-client",
                    "version": "1.0.0"
                }
            }
        }
    elif args.type == 'list':
        request = {
            "jsonrpc": "2.0",
            "id": "list-1",
            "method": "tools/list"
        }
    elif args.type == 'call':
        if not (args.id or args.name):
            parser.error("Either --id or --name is required for call request")
            
        params = {}
        if args.param:
            for key, value in args.param:
                # 尝试将值转换为数字（如果可能）
                try:
                    if '.' in value:
                        params[key] = float(value)
                    else:
                        params[key] = int(value)
                except ValueError:
                    params[key] = value
        
        request = {
            "jsonrpc": "2.0",
            "id": "call-1",
            "method": "tools/call",
            "params": {}
        }
        
        if args.id:
            request["params"]["id"] = args.id
        else:
            request["params"]["name"] = args.name
            
        request["params"]["arguments"] = params
    
    # 打印请求内容到stderr（不会发送到服务器）
    print(f"Sending request: {json.dumps(request, indent=2)}", file=sys.stderr)
    
    # 将请求发送到标准输出
    print(json.dumps(request), flush=True)

if __name__ == "__main__":
    main()
