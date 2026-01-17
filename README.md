# Student Resource Sharing App

A simple web app for students to share study materials using Firebase.

## Features
- Google sign-in with Firebase Authentication
- User profile setup (university, course, semester)
- PDF file upload to Firebase Storage
- **AI-powered analysis** with Google Gemini:
  - Automatic subject detection
  - Topic keyword extraction
  - Exam revision summary generation
- Organized storage by subject
- Search by subject, title, or topics
- View all uploaded resources with AI insights

## Setup Instructions

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the steps
3. Give your project a name

### 2. Enable Firebase Services

#### Enable Authentication:
1. In Firebase Console, click "Authentication" in the left menu
2. Click "Get started"
3. Click on "Google" under Sign-in providers
4. Toggle "Enable"
5. Click "Save"

#### Enable Firestore:
1. Click "Firestore Database" in the left menu
2. Click "Create database"
3. Select "Start in test mode" (for development)
4. Choose a location and click "Enable"

#### Enable Storage:
1. Click "Storage" in the left menu
2. Click "Get started"
3. Click "Next" and then "Done"

### 3. Get Firebase Configuration
1. In Firebase Console, click the gear icon next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon `</>`
5. Register your app with a nickname
6. Copy the `firebaseConfig` object

### 4. Get Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the API key

### 5. Create config.js
1. Create a new file named `config.js` in the root directory
2. Add your Firebase config and Gemini API key as shown below:

```javascript
// Configuration file
const firebaseConfig = {
    apiKey: "AIzaSyAbc123...",
    authDomain: "my-project.firebaseapp.com",
    projectId: "my-project",
    storageBucket: "my-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};

const GEMINI_API_KEY = "AIzaSyDef456...";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
```

> **Note:** `config.js` is included in `.gitignore` to keep your secrets safe. Do not commit this file to GitHub!

### 6. Run the App
1. Open `index.html` in a web browser
2. Click "Sign in with Google"
3. Complete your profile
4. Start uploading and viewing resources!

## File Structure
- `index.html` - Main HTML file with all screens
- `style.css` - Simple CSS styling
- `app.js` - JavaScript code for Firebase integration
- `README.md` - This file

## How It Works

### Login Flow:
1. User clicks "Sign in with Google"
2. Firebase handles Google authentication
3. App checks if user has a profile in Firestore

### Profile Setup:
1. If no profile exists, show profile form
2. User enters university, course, and semester
3. Profile is saved to Firestore under `users/{userId}`

### Dashboard:
1. Shows user information
2. Upload section for PDF files
3. List of all uploaded resources

### Upload Process:
1. User selects a PDF file
2. Text is extracted from the first part of the PDF
3. Text is sent to Gemini API for analysis
4. AI detects subject, extracts topics, and generates summary
5. File is uploaded to Firebase Storage under `resources/{subject}/{userId}/{filename}`
6. File URL, AI results, and metadata saved to Firestore `resources` collection
7. Resources list is refreshed with AI insights

### Search:
- Type in the search box to filter resources
- Searches across title, subject, and topics
- Results update instantly

## Firestore Structure

### users collection:
```
users/{userId}
  - name: string
  - email: string
  - university: string
  - course: string
  - semester: string
  - createdAt: timestamp
```

### resources collection:
```
resources/{resourceId}
  - title: string
  - fileName: string
  - fileURL: string
  - userId: string
  - userName: string
  - subject: string (AI-detected)
  - topics: array of strings (AI-extracted)
  - summary: array of strings (AI-generated)
  - uploadedAt: timestamp
```

## Notes for Students
- This is a simple prototype for learning
- Test mode Firestore is NOT secure for production
- Keep your Firebase config values safe
- Only PDF files are allowed for upload
