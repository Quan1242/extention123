"""Double-click Windows GUI setup, bundling Python and the native updater."""
import io
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
from installer_core import install

def payload_dir():
    return Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent)) / 'payload'

def self_test():
    """Exercise the bundled files/EXE without touching the user installation/registry."""
    from updater import write_message, read_message
    parent = Path(sys.executable).resolve().parent
    with tempfile.TemporaryDirectory(prefix='cvat-setup-check-', dir=parent) as folder:
        root = Path(folder).resolve()
        if not root.is_relative_to(parent):
            raise ValueError('Unexpected self-test directory')
        registered = []
        result = install(root, payload_dir(), register=lambda p: registered.append(str(p)))
        assert len(registered) == 1
        manifest = json.loads(Path(registered[0]).read_text())
        message = io.BytesIO()
        write_message(message, {'action': 'invalid'})
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        run = subprocess.run([manifest['path'], manifest['allowed_origins'][0]], input=message.getvalue(), capture_output=True, timeout=40, creationflags=flags)
        response = read_message(io.BytesIO(run.stdout))
        assert response['ok'] is False and response['error'] == 'Unsupported updater action', response
        assert Path(manifest['path']).parent == root
        return {'ok': True, 'version': result['version'], 'bundled_host_protocol': 'pass', 'registry': 'mocked', 'browser_install': 'not tested'}

def main():
    if '--self-test' in sys.argv:
        # A windowed EXE has no stdout; use an explicit report file for CI.
        try:
            result = self_test()
        except Exception as error:
            result = {'ok': False, 'error': str(error)}
        output = sys.argv[sys.argv.index('--report') + 1] if '--report' in sys.argv else None
        if output:
            Path(output).write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        if not result['ok']:
            raise SystemExit(1)
        return
    import tkinter as tk
    from tkinter import ttk
    app = tk.Tk()
    app.title('Cài đặt CVAT 3D TOOL')
    app.geometry('760x560')
    app.minsize(720, 540)
    app.configure(bg='#18181d')
    app.option_add('*Font', ('Segoe UI', 11))
    style = ttk.Style(app)
    style.theme_use('clam')
    style.configure('TProgressbar', troughcolor='#28282f', background='#34d399')
    frame = tk.Frame(app, bg='#18181d', padx=28, pady=24)
    frame.pack(fill='both', expand=True)
    def label(text, **rest):
        options = dict(bg='#18181d', fg='#e4e4e7', justify='left', anchor='w')
        options.update(rest)
        widget = tk.Label(frame, text=text, **options)
        widget.pack(fill='x', pady=6)
        return widget
    label('CVAT 3D TOOL', font=('Segoe UI', 22, 'bold'))
    label('Bộ cài Windows • Không cần Python hoặc PowerShell', fg='#a1a1aa')
    status = label('Đang cài tool và updater…', fg='#6ee7b7')
    bar = ttk.Progressbar(frame, mode='indeterminate')
    bar.pack(fill='x', pady=10)
    bar.start()
    details = label('Đang kiểm tra gói cài đặt. Không đóng hoặc tải lại tab CVAT.', wraplength=700)
    target = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData' / 'Local'))) / 'CVAT-3D-Tool'
    path_var = tk.StringVar(value=str(target / 'extension'))
    field = tk.Entry(frame, textvariable=path_var, readonlybackground='#27272f', fg='#eee', state='readonly', relief='flat')
    field.pack(fill='x', ipady=7, pady=8)
    buttons = tk.Frame(frame, bg='#18181d')
    buttons.pack(fill='x', pady=12)
    def button(text, command):
        widget = tk.Button(buttons, text=text, command=command, bg='#303039', fg='#eee', activebackground='#42424c', activeforeground='#fff', relief='flat', padx=12, pady=8)
        widget.pack(side='left', padx=(0, 10))
        return widget
    def copy_path():
        app.clipboard_clear()
        app.clipboard_append(path_var.get())
        app.update()
    copy = button('Copy thư mục extension', copy_path)
    copy.configure(state='disabled')
    close = button('Đóng', app.destroy)
    close.configure(state='disabled')
    app.protocol('WM_DELETE_WINDOW', lambda: app.destroy() if str(close['state']) != 'disabled' else None)
    label('Bộ cài không bật policy, không sửa profile trình duyệt và không truy cập annotation.', fg='#a1a1aa', wraplength=700)
    events = queue.Queue()
    def work():
        try:
            result = install(target, payload_dir())
            events.put(('done', result))
        except Exception as error:
            events.put(('error', str(error)))
    def poll():
        try:
            kind, value = events.get_nowait()
        except queue.Empty:
            app.after(100, poll)
            return
        bar.stop()
        close.configure(state='normal')
        bar.configure(mode='determinate', value=100 if kind == 'done' else 0)
        if kind == 'done':
            status.configure(text='Đã cài tool và updater ' + value['version'] + ' • Còn bước kích hoạt trong trình duyệt')
            details.configure(text='1. Save công việc CVAT và tắt bản tool cũ để tránh trùng HUD.\n2. Mở edge://extensions hoặc chrome://extensions.\n3. Bật Developer mode → Load unpacked → chọn thư mục bên dưới.\n4. Mở lại job CVAT. Updater đã đăng ký tự động, không cần nhập ID.')
            copy.configure(state='normal')
        else:
            status.configure(text='Chưa cài thành công', fg='#f87171')
            details.configure(text=value + '\nĐóng bộ cài, kiểm tra lại rồi mở lại Setup.exe.', fg='#fca5a5')
    app.after(150, lambda: threading.Thread(target=work, daemon=False).start())
    app.after(200, poll)
    app.mainloop()

if __name__ == '__main__':
    main()
