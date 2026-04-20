import sys
import json
import pyautogui
import ctypes

# Windows scaling fix (Coordinates precision ke liye)
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except:
        pass

# PyAutoGUI performance settings
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

# Windows API Constants
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000

def move_mouse(x_percent, y_percent):
    # Windows native absolute coordinates (0 to 65535)
    nx = int(x_percent * 65535)
    ny = int(y_percent * 65535)
    # Zero lag OS call
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, nx, ny, 0, 0)

def handle_key(key):
    if not key: return
    
    # Mapping browser keys to pyautogui
    mapping = {
        " ": "space",
        "Enter": "enter",
        "Backspace": "backspace",
        "Tab": "tab",
        "Escape": "esc",
        "ArrowUp": "up",
        "ArrowDown": "down",
        "ArrowLeft": "left",
        "ArrowRight": "right"
    }
    
    target = mapping.get(key, key.lower())
    
    try:
        if len(key) == 1:
            pyautogui.write(key)
        else:
            pyautogui.press(target)
    except Exception as e:
        sys.stderr.write(f"Key Error: {str(e)}\n")

# --- MAIN LOOP ---
sys.stdout.write("Python Controller Ready...\n")
sys.stdout.flush()

while True:
    line = sys.stdin.readline()
    if not line:
        break
    
    try:
        command = json.loads(line.strip())
        cmd_type = command.get('type')
        
        # 1. Mouse Move
        if cmd_type == 'mouse-move':
            move_mouse(command.get('x', 0), command.get('y', 0))
            
        # 2. Mouse Click
        elif cmd_type == 'mouse-click':
            # Move first, then click
            move_mouse(command.get('x', 0), command.get('y', 0))
            action = command.get('action', 'left-click')
            
            if action == 'left-click': pyautogui.click(button='left')
            elif action == 'right-click': pyautogui.click(button='right')
            elif action == 'double-click': pyautogui.doubleClick()

        # 3. Mouse Scroll
        elif cmd_type == 'mouse-scroll':
            pyautogui.scroll(int(command.get('delta', 0)))

        # 4. Keyboard Support (For single key-press events)
        elif cmd_type == 'key-press':
            handle_key(command.get('key'))

        # 5. Text Data (For bulk text)
        elif cmd_type == 'text-data':
            pyautogui.write(command.get('text', ''))

    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.stderr.flush()