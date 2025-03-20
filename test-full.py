#!/usr/bin/env python3
import json
import subprocess
import time
import sys
import threading
import os

def start_server():
    """启动MCP服务器并返回进程"""
    env = {
        **os.environ,
        "API_BASE_URL": "https://petstore3.swagger.io/api/v3",
        "OPENAPI_SPEC_PATH": "https://petstore3.swagger.io/api/v3/openapi.json",
        "SERVER_NAME": "petstore-mcp-server"
    }
    
    # 使用完整
    node_path = "/opt/homebrew/bin/node"
    
    # 启动服务器进程
    server = subprocess.Popen(
        [node_path, "--inspect", "bin/mcp-server.js"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
        bufsize=1024,
    )
    input("Press Enter to continue...")
    # 启动线程来读取stderr并打印
    def print_stderr():
        for line in server.stderr:
            print(f"[SERVER LOG] {line.strip()}")
    
    stderr_thread = threading.Thread(target=print_stderr, daemon=True)
    stderr_thread.start()
    
    return server

def send_request(server, request):
    """发送请求到服务器并等待响应"""
    # 将请求转换为JSON字符串
    request_json = json.dumps(request)
    print(f"\n>>> Sending: {request_json}")
    
    # 发送请求
    server.stdin.write(request_json + "\n")
    server.stdin.flush()
    
    # 读取响应
    response_line = server.stdout.readline().strip()
    print(f"<<< Response: {response_line}")
    
    try:
        return json.loads(response_line)
    except json.JSONDecodeError:
        print(f"Error: Could not parse response as JSON")
        return None

def run_tests():
    """运行完整的测试序列"""
    print("Starting MCP server...")
    server = start_server()
    
    try:
        # 等待服务器启动
        time.sleep(2)
        
        # 1. 初始化请求
        print("\n=== Testing initialize ===")
        init_request = {
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
        init_response = send_request(server, init_request)
        
        # 2. 发送initialized通知
        initialized_notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        server.stdin.write(json.dumps(initialized_notification) + "\n")
        server.stdin.flush()
        time.sleep(0.5)
        
        # 3. 获取工具列表
        print("\n=== Testing tools/list ===")
        list_request = {
            "jsonrpc": "2.0",
            "id": "list-1",
            "method": "tools/list"
        }
        list_response = send_request(server, list_request)
        print(f"Response: {list_response}")

        input("Press Enter to continue getPetById...")
        
        # 4. 调用getPetById工具
        print("\n=== Testing tools/call with getPetById ===")
        call_request = {
            "jsonrpc": "2.0",
            "id": "call-1",
            "method": "tools/call",
            "params": {
                "name": "getPetById",
                "arguments": {
                    "petId": 10
                }
            }
        }
        call_response = send_request(server, call_request)
        print(f"Response: {call_response}")

        input("Press Enter to continue GET-pet--petId-...")
        
        # 5. 使用ID调用工具
        print("\n=== Testing tools/call with ID ===")
        id_call_request = {
            "jsonrpc": "2.0",
            "id": "call-2",
            "method": "tools/call",
            "params": {
                "name": "GET-pet--petId-",
                "arguments": {
                    "petId": 10
                }
            }
        }
        id_call_response = send_request(server, id_call_request)
        
        # 6. 测试错误处理 - 缺少参数
        print("\n=== Testing error handling - missing parameter ===")
        error_request = {
            "jsonrpc": "2.0",
            "id": "error-1",
            "method": "tools/call",
            "params": {
                "name": "getPetById",
                "arguments": {}
            }
        }
        error_response = send_request(server, error_request)
        
    finally:
        print("\nShutting down server...")
        server.terminate()
        server.wait(timeout=2)

if __name__ == "__main__":
    run_tests()
