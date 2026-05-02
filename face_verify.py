# # face-verify.py
# import cv2
# import face_recognition
# import numpy as np
# import dlib
# import os

# # =========================
# # STEP 1: Ask which user is logging in
# # =========================
# user_id = input("Enter your user ID: ").strip()
# user_image_path = f"uploads/faces/{user_id}.jpg"

# if not os.path.exists(user_image_path):
#     print(f"No registered face found for user '{user_id}'.")
#     print("Please register your face first in uploads/faces/")
#     exit()

# # =========================
# # STEP 2: Load user's saved face
# # =========================
# known_image = face_recognition.load_image_file(user_image_path)
# known_encoding = face_recognition.face_encodings(known_image)[0]

# # =========================
# # STEP 3: Initialize camera
# # =========================
# cam = cv2.VideoCapture(0)

# # =========================
# # STEP 4: Initialize dlib detector + predictor
# # =========================
# detector = dlib.get_frontal_face_detector()
# predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# # =========================
# # STEP 5: Eye Aspect Ratio (EAR) function
# # =========================
# def eye_aspect_ratio(eye):
#     A = np.linalg.norm(eye[1] - eye[5])
#     B = np.linalg.norm(eye[2] - eye[4])
#     C = np.linalg.norm(eye[0] - eye[3])
#     return (A + B) / (2.0 * C)

# # =========================
# # STEP 6: Verification Loop
# # =========================
# face_matched = False
# blink_detected = False

# print("Starting Face Verification. Look at the camera and blink once.")

# while True:
#     ret, frame = cam.read()
#     if not ret:
#         print("Camera error!")
#         break

#     rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#     gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

#     # -------- Face Recognition --------
#     face_locations = face_recognition.face_locations(rgb)
#     face_encodings = face_recognition.face_encodings(rgb, face_locations)

#     if len(face_encodings) > 0:
#         result = face_recognition.compare_faces([known_encoding], face_encodings[0], tolerance=0.45)
#         face_matched = result[0]

#     # -------- Blink Detection --------
#     faces = detector(gray)
#     for face in faces:
#         shape = predictor(gray, face)
#         shape = np.array([[p.x, p.y] for p in shape.parts()])

#         left_eye = shape[42:48]
#         right_eye = shape[36:42]

#         ear = (eye_aspect_ratio(left_eye) + eye_aspect_ratio(right_eye)) / 2

#         if ear < 0.21:
#             blink_detected = True

#     # -------- Final Decision --------
#     if face_matched and blink_detected:
#         print(f"LOGIN SUCCESS ✅ User: {user_id}")
#         break
#     elif face_matched and not blink_detected:
#         print("FAKE / PHOTO SPOOF DETECTED ❌")
#     else:
#         print("FACE NOT RECOGNIZED ❌")

#     cv2.imshow("Face Verification", frame)
#     if cv2.waitKey(1) & 0xFF == ord('q'):
#         print("Verification aborted by user")
#         break

# # =========================
# # STEP 7: Cleanup
# # =========================
# cam.release()
# cv2.destroyAllWindows()
