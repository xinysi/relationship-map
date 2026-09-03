# -*- coding: utf-8 -*-
"""无缓存本地静态服务器（开发调试用）"""
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ThreadingNoCacheServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with ThreadingNoCacheServer(('127.0.0.1', 8642), NoCacheHandler) as httpd:
        print('serving on 8642 (no-cache)')
        httpd.serve_forever()
