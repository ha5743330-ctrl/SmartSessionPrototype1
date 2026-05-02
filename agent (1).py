import socketio
import ctypes
import threading
import time
import pyautogui

# ===== DPI FIX =====
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except:
    ctypes.windll.user32.SetProcessDPIAware()

# ===== SOCKET =====
sio = socketio.Client()

URL = "https://inexpressibly-acnodal-gladis.ngrok-free.dev/"
CODE = "278961"

# ===== WINDOWS SENDINPUT SETUP =====
PUL = ctypes.POINTER(ctypes.c_ulong)

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", PUL)
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_ulong),
        ("mi", MOUSEINPUT)
    ]

# Mouse flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800

# ===== SCREEN SIZE =====
screen_w = ctypes.windll.user32.GetSystemMetrics(0)
screen_h = ctypes.windll.user32.GetSystemMetrics(1)

def send_input(flags, x=0, y=0, data=0):
    """Professional Windows input injection"""
    extra = ctypes.c_ulong(0)

    dx = int(x * 65535)
    dy = int(y * 65535)

    mi = MOUSEINPUT(dx, dy, data, flags, 0, ctypes.pointer(extra))
    inp = INPUT(0, mi)

    ctypes.windll.user32.SendInput(1, ctypes.pointer(inp), ctypes.sizeof(inp))


# ===== STATE MANAGEMENT =====
class MouseState:
    def __init__(self):
        self.is_pressed = False
        self.button = None
        self.last_event = time.time()
        self.lock = threading.Lock()

state = MouseState()


# ===== SAFETY AUTO RELEASE =====
def auto_release():
    while True:
        with state.lock:
            if state.is_pressed and (time.time() - state.last_event > 8):
                send_input(MOUSEEVENTF_LEFTUP)
                send_input(MOUSEEVENTF_RIGHTUP)
                state.is_pressed = False
                state.button = None
                print("🛡️ Auto Release Triggered")
        time.sleep(1)

threading.Thread(target=auto_release, daemon=True).start()


# ===== SMOOTH MOVE =====
def smooth_move(x, y):
    send_input(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, x, y)


# ===== SOCKET EVENTS =====
@sio.event
def connect():
    print(f"✅ PRO AGENT CONNECTED → Room {CODE}")
    sio.emit('join-room', {'sessionCode': CODE})


@sio.on('python-control')
def handle_control(payload):
    try:
        cmd = payload.get('type')
        data = payload.get('data', {})

        x = data.get('x', 0)
        y = data.get('y', 0)

        # ===== MOVE / DRAG =====
        if cmd in ['mouse-move', 'mouse-drag']:
            smooth_move(x, y)

        # ===== MOUSE DOWN =====
        elif cmd == 'mouse-down':
            smooth_move(x, y)

            button = data.get('button', 'left')
            flag = MOUSEEVENTF_LEFTDOWN if button == 'left' else MOUSEEVENTF_RIGHTDOWN

            send_input(flag)

            with state.lock:
                state.is_pressed = True
                state.button = button
                state.last_event = time.time()

        # ===== MOUSE UP =====
        elif cmd == 'mouse-up':
            smooth_move(x, y)

            button = data.get('button', 'left')
            flag = MOUSEEVENTF_LEFTUP if button == 'left' else MOUSEEVENTF_RIGHTUP

            send_input(flag)

            with state.lock:
                state.is_pressed = False
                state.button = None

        # ===== CLICK =====
        elif cmd == 'mouse-click':
            smooth_move(x, y)

            button = data.get('button', 'left')
            down = MOUSEEVENTF_LEFTDOWN if button == 'left' else MOUSEEVENTF_RIGHTDOWN
            up = MOUSEEVENTF_LEFTUP if button == 'left' else MOUSEEVENTF_RIGHTUP

            send_input(down)
            send_input(up)

        # ===== SCROLL =====
        elif cmd == 'mouse-scroll':
            delta = data.get('delta', 0)

            # Normalize scroll
            amount = 120 if delta > 0 else -120

            send_input(MOUSEEVENTF_WHEEL, 0, 0, amount)

        # ===== KEYBOARD =====
        elif cmd in ['key-press', 'key-down', 'key-direct']:
            key = data.get('key', '')
            if not key:
                return

            key_map = {"control": "ctrl", "meta": "win", " ": "space"}
            key = key_map.get(key.lower(), key.lower())

            modifiers = [m for m in ['ctrl', 'alt', 'shift'] if data.get(m)]

            if modifiers:
                pyautogui.hotkey(*modifiers, key)
            elif len(key) == 1:
                pyautogui.write(key)
            else:
                pyautogui.press(key)

    except Exception as e:
        print("❌ Error:", e)


# ===== START =====
if __name__ == "__main__":
    try:
        sio.connect(URL, transports=['websocket'])
        sio.wait()
    except Exception as e:
        print("❌ Connection Failed:", e)