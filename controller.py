# import sys
# import json
# import pyautogui
# import ctypes

# # Windows scaling fix (Coordinates precision ke liye)
# try:
#     ctypes.windll.shcore.SetProcessDpiAwareness(1)
# except Exception:
#     try:
#         ctypes.windll.user32.SetProcessDPIAware()
#     except:
#         pass

# # PyAutoGUI performance settings
# pyautogui.FAILSAFE = False
# pyautogui.PAUSE = 0

# # Windows API Constants
# MOUSEEVENTF_MOVE = 0x0001
# MOUSEEVENTF_ABSOLUTE = 0x8000

# def move_mouse(x_percent, y_percent):
#     # Windows native absolute coordinates (0 to 65535)
#     nx = int(x_percent * 65535)
#     ny = int(y_percent * 65535)
#     # Zero lag OS call
#     ctypes.windll.user32.mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, nx, ny, 0, 0)

# def handle_key(key, ctrl=False, alt=False, shift=False):
#     if not key: return
    
#     mapping = {
#         " ": "space",
#         "Enter": "enter",
#         "Backspace": "backspace",
#         "Tab": "tab",
#         "Escape": "esc",
#         "ArrowUp": "up",
#         "ArrowDown": "down",
#         "ArrowLeft": "left",
#         "ArrowRight": "right",
#         "Control": "ctrl",
#         "Alt": "alt",
#         "Shift": "shift"
#     }
    
#     # Clean the key name
#     target = mapping.get(key, key.lower())
    
#     try:
#         # Shortcuts handle karne ke liye (e.g. Ctrl + C)
#         modifiers = []
#         if ctrl: modifiers.append('ctrl')
#         if alt: modifiers.append('alt')
#         if shift: modifiers.append('shift')

#         if modifiers and len(target) > 0:
#             pyautogui.hotkey(*modifiers, target)
#         elif len(key) == 1:
#             # Simple typing (a, b, c, etc.)
#             pyautogui.write(key)
#         else:
#             # Special keys (Enter, Backspace)
#             pyautogui.press(target)
            
#     except Exception as e:
#         sys.stderr.write(f"Key Error: {str(e)}\n")
# # --- MAIN LOOP ---
# # --- MAIN LOOP UPDATE ---
# while True:
#     line = sys.stdin.readline()
#     if not line: break
    
#     try:
#         command = json.loads(line.strip())
#         cmd_type = command.get('type')
#         # Payload aksar 'data' ke andar hota hai
#         payload = command.get('data', {}) 
        
#         # 1. Mouse Move
#         if cmd_type == 'mouse-move':
#             move_mouse(payload.get('x', 0), payload.get('y', 0))
            
#         # 2. Keyboard Fix (Ye change zaroori hai)
#         elif cmd_type in ['key-press', 'key-direct']:
#             handle_key(
#                 payload.get('key'),
#                 payload.get('ctrl', False),
#                 payload.get('alt', False),
#                 payload.get('shift', False)
#             )
            
#         # 3. Mouse Click
#         elif cmd_type == 'mouse-click':
#             move_mouse(payload.get('x', 0), payload.get('y', 0))
#             pyautogui.click(button=payload.get('button', 'left'))

#     except Exception as e:
#         sys.stderr.write(f"Error: {str(e)}\n")
#         sys.stderr.flush()
