// Firebase and Gemini Configuration are loaded from config.js
// Initialize Firebase
if (typeof firebaseConfig !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
} else {
    console.error('firebaseConfig not found. Make sure config.js is loaded.');
}


// Get Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Get screen elements
const loginScreen = document.getElementById('login-screen');
const profileScreen = document.getElementById('profile-screen');
const dashboardScreen = document.getElementById('dashboard-screen');

// Get button elements
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

// Get form elements
const profileForm = document.getElementById('profile-form');
const uploadForm = document.getElementById('upload-form');

// Current user variable
let currentUser = null;

// Check if user is already logged in
auth.onAuthStateChanged(function (user) {
    if (user) {
        // User is logged in
        currentUser = user;
        checkUserProfile();
    } else {
        // User is not logged in
        showScreen('login');
    }
});

// Google login button click
googleLoginBtn.addEventListener('click', function () {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(function (result) {
            // Login successful
            currentUser = result.user;
            checkUserProfile();
        })
        .catch(function (error) {
            alert('Login failed: ' + error.message);
        });
});

// Check if user has a profile in Firestore
function checkUserProfile() {
    db.collection('users').doc(currentUser.uid).get()
        .then(function (doc) {
            if (doc.exists) {
                // Profile exists, show dashboard
                showDashboard(doc.data());
            } else {
                // No profile, show profile setup
                showScreen('profile-setup');
            }
        })
        .catch(function (error) {
            alert('Error checking profile: ' + error.message);
        });
}

// Profile form submit
profileForm.addEventListener('submit', function (e) {
    e.preventDefault();

    // Get form values
    const university = document.getElementById('university').value;
    const course = document.getElementById('course').value;
    const semester = document.getElementById('semester').value;

    // Save profile to Firestore
    db.collection('users').doc(currentUser.uid).set({
        name: currentUser.displayName,
        email: currentUser.email,
        university: university,
        course: course,
        semester: semester,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
        .then(function () {
            // Profile saved successfully
            const profileData = {
                name: currentUser.displayName,
                university: university,
                course: course,
                semester: semester
            };
            showDashboard(profileData);
        })
        .catch(function (error) {
            alert('Error saving profile: ' + error.message);
        });
});

// Show dashboard with user data
function showDashboard(profileData) {
    showScreen('dashboard');
    // Load resources (removed welcome message display)
    loadResources();
}

// File input change event - show selected filename
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');

fileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
        fileNameDisplay.textContent = this.files[0].name;
    } else {
        fileNameDisplay.textContent = '';
    }
});

// Upload form submit
uploadForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const fileInput = document.getElementById('file-input');
    const titleInput = document.getElementById('file-title');
    const statusElement = document.getElementById('upload-status');

    const file = fileInput.files[0];

    if (!file) {
        statusElement.textContent = 'Please select a file';
        return;
    }

    // Check if file is PDF
    if (file.type !== 'application/pdf') {
        statusElement.textContent = 'Only PDF files are allowed';
        return;
    }

    statusElement.textContent = 'Analyzing PDF with AI...';

    // Extract text from PDF and analyze with Gemini
    extractPDFText(file)
        .then(function (extractedText) {
            // Fetch user profile for context
            return db.collection('users').doc(currentUser.uid).get()
                .then(function (doc) {
                    const profile = doc.exists ? doc.data() : {};
                    // Call Gemini API to analyze the text with user context
                    return analyzeWithGemini(extractedText, profile);
                });
        })
        .then(function (aiResult) {
            statusElement.textContent = 'Uploading to storage...';

            // Create file path based on userId (Security Requirement)
            const fileName = Date.now() + '_' + file.name;
            const subject = aiResult.subject || 'Other';
            // Path: resources/{userId}/{fileName}
            const storagePath = 'resources/' + currentUser.uid + '/' + fileName;
            const storageRef = storage.ref(storagePath);

            // Upload file to Firebase Storage
            return storageRef.put(file).then(function (snapshot) {
                return snapshot.ref.getDownloadURL().then(function (downloadURL) {
                    return { downloadURL: downloadURL, aiResult: aiResult };
                });
            });
        })
        .then(function (result) {
            // Save file info with AI results to Firestore
            return db.collection('resources').add({
                title: titleInput.value || file.name,
                fileName: file.name,
                fileURL: result.downloadURL,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                subject: result.aiResult.subject,
                topics: result.aiResult.topics,
                summary: result.aiResult.summary,
                questions: result.aiResult.questions || [],
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function () {
            statusElement.textContent = 'Upload successful!';
            fileInput.value = '';
            titleInput.value = '';
            fileNameDisplay.textContent = ''; // Clear file name display

            // Reload resources list
            loadResources();
        })
        .catch(function (error) {
            statusElement.textContent = 'Upload failed: ' + error.message;
        });
});


// Store all resources for search
let allResources = [];

// Load and display resources
function loadResources() {
    const resourcesList = document.getElementById('resources-list');
    resourcesList.innerHTML = '<p>Loading...</p>';

    // Get resources for CURRENT USER ONLY
    // We removed .orderBy server-side to avoid needing a manual index creation
    db.collection('resources')
        .where('userId', '==', currentUser.uid)
        .get()
        .then(function (querySnapshot) {
            resourcesList.innerHTML = '';
            allResources = []; // Clear the array

            if (querySnapshot.empty) {
                resourcesList.innerHTML = '<p class="no-resources">No resources uploaded yet</p>';
                return;
            }

            // Store all resources
            querySnapshot.forEach(function (doc) {
                const resource = doc.data();
                resource.id = doc.id; // Store properties for deletion
                allResources.push(resource);
            });

            // Sort client-side by date (Newest first)
            allResources.sort(function (a, b) {
                const dateA = a.uploadedAt ? a.uploadedAt.seconds : 0;
                const dateB = b.uploadedAt ? b.uploadedAt.seconds : 0;
                return dateB - dateA;
            });

            // Display sorted resources
            allResources.forEach(function (resource) {
                const resourceItem = createResourceItem(resource);
                resourcesList.appendChild(resourceItem);
            });
        })
        .catch(function (error) {
            resourcesList.innerHTML = '<p>Error loading resources: ' + error.message + '</p>';
        });
}

// Create a resource item element
function createResourceItem(resource) {
    const div = document.createElement('div');
    div.className = 'resource-item';

    const title = document.createElement('h4');
    title.textContent = resource.title;

    // Subject badge
    if (resource.subject) {
        const subjectBadge = document.createElement('span');
        subjectBadge.className = 'subject-badge';
        subjectBadge.textContent = resource.subject;
        title.appendChild(document.createTextNode(' '));
        title.appendChild(subjectBadge);
    }

    // Topics
    if (resource.topics && resource.topics.length > 0) {
        const topicsDiv = document.createElement('div');
        topicsDiv.className = 'topics';
        resource.topics.forEach(function (topic) {
            const tag = document.createElement('span');
            tag.className = 'topic-tag';
            tag.textContent = topic;
            topicsDiv.appendChild(tag);
        });
        div.appendChild(title);
        div.appendChild(topicsDiv);
    } else {
        div.appendChild(title);
    }

    // Summary
    if (resource.summary && resource.summary.length > 0) {
        const summaryTitle = document.createElement('p');
        summaryTitle.innerHTML = '<strong>Summary:</strong>';
        div.appendChild(summaryTitle);

        const summaryList = document.createElement('ul');
        summaryList.className = 'summary-list';
        resource.summary.forEach(function (point) {
            const li = document.createElement('li');
            li.textContent = point;
            summaryList.appendChild(li);
        });
        div.appendChild(summaryList);
    }

    const uploader = document.createElement('p');
    uploader.textContent = 'Uploaded by: ' + resource.userName;

    const date = document.createElement('p');
    if (resource.uploadedAt) {
        date.textContent = 'Date: ' + resource.uploadedAt.toDate().toLocaleDateString();
    } else {
        date.textContent = 'Date: Just now';
    }

    const link = document.createElement('p');
    const anchor = document.createElement('a');
    anchor.href = resource.fileURL;
    anchor.target = '_blank';
    anchor.textContent = 'Download PDF';
    link.appendChild(anchor);

    div.appendChild(uploader);
    div.appendChild(date);
    div.appendChild(uploader);
    div.appendChild(date);
    div.appendChild(link);

    // Add Delete Button (only if user owns the file - strictly verified, but UI check helps)
    if (resource.userId === currentUser.uid) {
        // Take Test Button
        if (resource.questions && resource.questions.length > 0) {
            const testBtn = document.createElement('button');
            testBtn.textContent = 'Take Test';
            testBtn.className = 'btn btn-primary btn-small';
            testBtn.style.marginRight = '10px';
            testBtn.style.marginTop = '10px';

            testBtn.addEventListener('click', function () {
                window.location.href = `test.html?resourceId=${resource.id}`;
            });

            div.appendChild(testBtn);
        }

        // Quick Revise Button
        const reviseBtn = document.createElement('button');
        reviseBtn.textContent = '📖 Quick Revise';
        reviseBtn.className = 'btn btn-secondary btn-small';
        reviseBtn.style.marginRight = '10px';
        reviseBtn.style.marginTop = '10px';

        reviseBtn.addEventListener('click', function () {
            showQuickRevision(resource);
        });

        div.appendChild(reviseBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete File';
        deleteBtn.className = 'delete-btn'; // You can style this in CSS
        deleteBtn.style.backgroundColor = '#ff4444';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.style.borderRadius = '4px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.marginTop = '10px';

        deleteBtn.addEventListener('click', function () {
            deleteResource(resource.id, resource.fileURL);
        });

        div.appendChild(deleteBtn);
    }

    return div;
}

// Logout button click
logoutBtn.addEventListener('click', function () {
    auth.signOut()
        .then(function () {
            currentUser = null;
            showScreen('login');
        })
        .catch(function (error) {
            alert('Logout failed: ' + error.message);
        });
});

// Profile button click
const profileBtn = document.getElementById('profile-btn');
if (profileBtn) {
    profileBtn.addEventListener('click', function () {
        showProfileScreen();
    });
}

// Back to dashboard button
const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
if (backToDashboardBtn) {
    backToDashboardBtn.addEventListener('click', function () {
        showScreen('dashboard');
    });
}

// Logout from profile page
const logoutBtnProfile = document.getElementById('logout-btn-profile');
if (logoutBtnProfile) {
    logoutBtnProfile.addEventListener('click', function () {
        auth.signOut()
            .then(function () {
                currentUser = null;
                showScreen('login');
            })
            .catch(function (error) {
                alert('Logout failed: ' + error.message);
            });
    });
}

// Show profile screen
function showProfileScreen() {
    showScreen('profile');
    loadProfileData();
}

// Load profile data
function loadProfileData() {
    db.collection('users').doc(currentUser.uid).get()
        .then(function (doc) {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('profile-email').textContent = currentUser.email;
                document.getElementById('profile-name').textContent = currentUser.displayName;
                document.getElementById('profile-university').textContent = data.university || 'Not set';
                document.getElementById('profile-course').textContent = data.course || 'Not set';
                document.getElementById('profile-semester').textContent = data.semester || 'Not set';
            }
        })
        .catch(function (error) {
            console.error('Error loading profile:', error);
        });
}

// Edit profile button
const editProfileBtn = document.getElementById('edit-profile-btn');
if (editProfileBtn) {
    editProfileBtn.addEventListener('click', function () {
        // Load current values into form
        db.collection('users').doc(currentUser.uid).get()
            .then(function (doc) {
                if (doc.exists) {
                    const data = doc.data();
                    document.getElementById('edit-university').value = data.university || '';
                    document.getElementById('edit-course').value = data.course || '';
                    document.getElementById('edit-semester').value = data.semester || '';
                }
            });

        // Toggle view/edit
        document.getElementById('profile-view').classList.add('hidden');
        document.getElementById('profile-edit-form').classList.remove('hidden');
    });
}

// Cancel edit button
const cancelEditBtn = document.getElementById('cancel-edit-btn');
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', function () {
        document.getElementById('profile-view').classList.remove('hidden');
        document.getElementById('profile-edit-form').classList.add('hidden');
    });
}

// Profile edit form submit
const profileEditForm = document.getElementById('profile-edit-form');
if (profileEditForm) {
    profileEditForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const university = document.getElementById('edit-university').value;
        const course = document.getElementById('edit-course').value;
        const semester = document.getElementById('edit-semester').value;

        db.collection('users').doc(currentUser.uid).update({
            university: university,
            course: course,
            semester: semester
        })
            .then(function () {
                // Update display
                loadProfileData();
                // Toggle back to view
                document.getElementById('profile-view').classList.remove('hidden');
                document.getElementById('profile-edit-form').classList.add('hidden');
                alert('Profile updated successfully!');
            })
            .catch(function (error) {
                alert('Error updating profile: ' + error.message);
            });
    });
}

// Delete resource function
function deleteResource(docId, fileUrl) {
    if (confirm('Are you sure you want to delete this file? This cannot be undone.')) {
        // 1. Delete from Firestore
        db.collection('resources').doc(docId).delete()
            .then(function () {
                // 2. Delete from Storage
                // Create a reference to the file to delete
                const storageRef = firebase.storage().refFromURL(fileUrl);
                return storageRef.delete();
            })
            .then(function () {
                // 3. UI Feedback
                alert('File deleted successfully.');
                loadResources(); // Refresh the list
            })
            .catch(function (error) {
                console.error("Error removing file: ", error);
                alert("Error removing file: " + error.message);
            });
    }
}

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Extract text from PDF file using PDF.js with Smart Sampling
function extractPDFText(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();

        reader.onload = function (e) {
            const arrayBuffer = e.target.result;

            // Load the PDF document
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

            loadingTask.promise.then(function (pdf) {
                // Smart Sampling: Analyze max 5 pages
                const maxPagesToAnalyze = Math.min(pdf.numPages, 5);
                const pagePromises = [];

                for (let i = 1; i <= maxPagesToAnalyze; i++) {
                    pagePromises.push(
                        pdf.getPage(i).then(page => {
                            return page.getTextContent().then(content => {
                                const text = content.items.map(item => item.str).join(' ');
                                return { page: i, text: text, length: text.length };
                            });
                        })
                    );
                }

                Promise.all(pagePromises).then(pages => {
                    // Logic: Always include Page 1 & 2
                    // Plus one "Content Heavy" page from the first 5

                    let finalText = '';
                    const selectedPages = new Set();

                    // 1. Add Page 1
                    if (pages.length > 0) {
                        finalText += `--- Page 1 ---\n${pages[0].text}\n\n`;
                        selectedPages.add(1);
                    }

                    // 2. Add Page 2 (if exists)
                    if (pages.length > 1) {
                        finalText += `--- Page 2 ---\n${pages[1].text}\n\n`;
                        selectedPages.add(2);
                    }

                    // 3. Find "Meatiest" Page (Max length) from the sampled set
                    // Exclude pages we already added (1 & 2) if possible, or just add more context
                    let maxPage = null;
                    let maxLength = -1;

                    pages.forEach(p => {
                        if (!selectedPages.has(p.page)) {
                            if (p.length > maxLength) {
                                maxLength = p.length;
                                maxPage = p;
                            }
                        }
                    });

                    // If we found a dense page that isn't 1 or 2, add it
                    if (maxPage) {
                        finalText += `--- Page ${maxPage.page} (Content Heavy) ---\n${maxPage.text}\n\n`;
                    }

                    // Clean up
                    finalText = finalText.replace(/\s+/g, ' ').trim();

                    if (finalText.length < 50) {
                        finalText = 'No readable text content found (possibly parsed as image).';
                    } else {
                        // Limit to ~4000 chars for AI context
                        finalText = finalText.substring(0, 4000);
                    }

                    resolve(finalText);
                });

            }).catch(function (error) {
                console.error("Error parsing PDF: ", error);
                reject(new Error('Failed to parse PDF content'));
            });
        };

        reader.onerror = function () {
            reject(new Error('Failed to read PDF file'));
        };

        reader.readAsArrayBuffer(file);
    });
}

// Analyze text with Gemini API
function analyzeWithGemini(text, userProfile) {
    // Default to "Unknown" if profile is missing
    const university = userProfile && userProfile.university ? userProfile.university : "Unknown University";
    const course = userProfile && userProfile.course ? userProfile.course : "Unknown Course";
    const semester = userProfile && userProfile.semester ? userProfile.semester : "Unknown Year/Semester";

    // Prepare the prompt with user context
    const prompt = `You are analyzing study material for students.

Based only on the content below:
1. Identify the academic subject (choose only from: Physics, Chemistry, Maths, Biology, Computer Science, Other)
2. Give 5 topic keywords
3. Give a 5-bullet-point revision summary
4. Generate 5 multiple-choice questions with 4 options each and give the correct answer

Return strictly in this format:

Subject:
Topics:
Summary:
- point 1
- point 2
- point 3
- point 4
- point 5

Questions:
1. Question Text
Difficulty: Easy
A) Option A
B) Option B
C) Option C
D) Option D
Answer: A

2. Question Text
Difficulty: Medium
A) Option A
B) Option B
C) Option C
D) Option D
Answer: B

Note: Assign difficulty (Easy, Medium, or Hard) based on complexity.

Study Material (Student: ${university}, ${course}, ${semester}):
${text}`;

    // Prepare request body
    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }]
    };

    // Call Gemini API
    return fetch(GEMINI_API_URL + '?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
        .then(function (response) {
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                }
                throw new Error('Gemini API failed');
            }
            return response.json();
        })
        .then(function (data) {
            // Extract text from response
            const responseText = data.candidates[0].content.parts[0].text;
            return parseGeminiResponse(responseText);
        })
        .catch(function (error) {
            // If AI fails, return default values
            console.error('Gemini API error:', error);

            // Show user friendly error for rate limits
            if (error.message.includes('Rate limit')) {
                alert('Too many requests! Please wait a minute before uploading again.');
            }

            return {
                subject: 'Other',
                topics: [],
                summary: []
            };
        });
}

// Parse Gemini response using simple string methods
// Note: This function is now used in the Cloud Function backend
// Keeping it here for reference, but it's not called from frontend anymore
function parseGeminiResponse(responseText) {
    const result = {
        subject: 'Other',
        topics: [],
        summary: [],
        questions: []
    };

    // Extract subject
    const subjectMatch = responseText.match(/Subject:\s*([^\n]+)/i);
    if (subjectMatch) {
        const detectedSubject = subjectMatch[1].trim();
        const validSubjects = ['Physics', 'Chemistry', 'Maths', 'Biology', 'Computer Science'];

        // Check if detected subject is in valid list
        for (let i = 0; i < validSubjects.length; i++) {
            if (detectedSubject.toLowerCase().includes(validSubjects[i].toLowerCase())) {
                result.subject = validSubjects[i];
                break;
            }
        }
    }

    // Extract topics
    const topicsMatch = responseText.match(/Topics:\s*([^\n]+(?:\n(?!Summary:)[^\n]+)*)/i);
    if (topicsMatch) {
        const topicsText = topicsMatch[1];
        const topicsList = topicsText.split(/[,\n]/).map(function (t) {
            return t.trim().replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
        }).filter(function (t) {
            return t.length > 0 && t.length < 50;
        }).slice(0, 5);
        result.topics = topicsList;
    }

    // Extract summary
    const summaryMatch = responseText.match(/Summary:\s*([\s\S]+)/i);
    if (summaryMatch) {
        const summaryText = summaryMatch[1];
        const summaryLines = summaryText.split('\n').map(function (line) {
            return line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
        }).filter(function (line) {
            return line.length > 10 && line.length < 200;
        }).slice(0, 5);
        result.summary = summaryLines;
    }



    // Extract questions
    const questionsMatch = responseText.match(/Questions:\s*([\s\S]+)/i);
    if (questionsMatch) {
        const questionsText = questionsMatch[1];
        // Split by numbered questions e.g. "1. "
        const rawQuestions = questionsText.split(/\n\d+\.\s+/).filter(q => q.trim().length > 0);

        result.questions = rawQuestions.map(function (qBlock) {
            const lines = qBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 3) return null; // Invalid question block

            const questionText = lines[0];

            // Extract difficulty
            let difficulty = 'Medium'; // Default
            const difficultyLine = lines.find(l => l.toLowerCase().startsWith('difficulty:'));
            if (difficultyLine) {
                const diffMatch = difficultyLine.match(/difficulty:\s*(easy|medium|hard)/i);
                if (diffMatch) {
                    difficulty = diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
                }
            }

            const answerLine = lines.find(l => l.toUpperCase().startsWith('ANSWER:'));
            const answer = answerLine ? answerLine.split(':')[1].trim().charAt(0).toUpperCase() : '';

            const options = lines.filter(l =>
                /^[A-D]\)/i.test(l) && !l.toUpperCase().startsWith('ANSWER:') && !l.toLowerCase().startsWith('difficulty:')
            );

            return {
                question: questionText,
                options: options,
                correctAnswer: answer,
                difficulty: difficulty
            };
        }).filter(q => q !== null && q.options.length === 4 && q.correctAnswer);
    }

    return result;
}

// Search input event listener
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        filterResources(this.value);
    });
}

// Filter resources based on search query
function filterResources(query) {
    const resourcesList = document.getElementById('resources-list');
    resourcesList.innerHTML = '';

    if (!query || query.trim() === '') {
        // Show all resources
        allResources.forEach(function (resource) {
            const resourceItem = createResourceItem(resource);
            resourcesList.appendChild(resourceItem);
        });
        return;
    }

    const searchLower = query.toLowerCase();

    // Filter resources
    const filtered = allResources.filter(function (resource) {
        // Search in title
        if (resource.title.toLowerCase().includes(searchLower)) {
            return true;
        }

        // Search in subject
        if (resource.subject && resource.subject.toLowerCase().includes(searchLower)) {
            return true;
        }

        // Search in topics
        if (resource.topics) {
            for (let i = 0; i < resource.topics.length; i++) {
                if (resource.topics[i].toLowerCase().includes(searchLower)) {
                    return true;
                }
            }
        }

        return false;
    });

    if (filtered.length === 0) {
        resourcesList.innerHTML = '<p class="no-resources">No matching resources found</p>';
    } else {
        filtered.forEach(function (resource) {
            const resourceItem = createResourceItem(resource);
            resourcesList.appendChild(resourceItem);
        });
    }
}

// Helper function to show/hide screens
function showScreen(screenName) {
    loginScreen.classList.add('hidden');
    profileScreen.classList.add('hidden');
    dashboardScreen.classList.add('hidden');

    if (screenName === 'login') {
        loginScreen.classList.remove('hidden');
    } else if (screenName === 'profile') {
        profileScreen.classList.remove('hidden');
    } else if (screenName === 'dashboard') {
        dashboardScreen.classList.remove('hidden');
    }
}

// Quick Revision Modal Function
function showQuickRevision(resource) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'revision-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'glass-card';
    modalContent.style.cssText = `
        max-width: 700px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        padding: 2rem;
        position: relative;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✖';
    closeBtn.className = 'btn btn-secondary btn-small';
    closeBtn.style.cssText = `
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 40px;
        height: 40px;
        padding: 0;
        font-size: 1.2rem;
    `;
    closeBtn.addEventListener('click', function () {
        document.body.removeChild(modal);
    });

    // Title
    const title = document.createElement('h2');
    title.textContent = '📖 Quick Revision: ' + resource.title;
    title.style.cssText = `
        margin-bottom: 1.5rem;
        font-size: 1.8rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    `;

    // Subject
    const subjectSection = document.createElement('div');
    subjectSection.style.marginBottom = '1.5rem';
    const subjectLabel = document.createElement('h3');
    subjectLabel.textContent = '📚 Subject';
    subjectLabel.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;';
    const subjectValue = document.createElement('p');
    subjectValue.textContent = resource.subject || 'Not specified';
    subjectValue.style.cssText = 'font-size: 1.2rem; font-weight: 600; color: #43e97b;';
    subjectSection.appendChild(subjectLabel);
    subjectSection.appendChild(subjectValue);

    // Topics
    const topicsSection = document.createElement('div');
    topicsSection.style.marginBottom = '1.5rem';
    const topicsLabel = document.createElement('h3');
    topicsLabel.textContent = '🏷️ Key Topics';
    topicsLabel.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;';
    topicsSection.appendChild(topicsLabel);

    if (resource.topics && resource.topics.length > 0) {
        const topicsContainer = document.createElement('div');
        topicsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem;';
        resource.topics.forEach(function (topic) {
            const tag = document.createElement('span');
            tag.textContent = topic;
            tag.style.cssText = `
                padding: 0.5rem 1rem;
                background: rgba(67, 158, 251, 0.15);
                border: 1px solid rgba(67, 158, 251, 0.3);
                border-radius: 8px;
                font-size: 0.9rem;
                color: #4facfe;
                font-weight: 500;
            `;
            topicsContainer.appendChild(tag);
        });
        topicsSection.appendChild(topicsContainer);
    } else {
        const noTopics = document.createElement('p');
        noTopics.textContent = 'No topics available';
        noTopics.style.color = 'rgba(255, 255, 255, 0.5)';
        topicsSection.appendChild(noTopics);
    }

    // Summary
    const summarySection = document.createElement('div');
    summarySection.style.marginBottom = '1.5rem';
    const summaryLabel = document.createElement('h3');
    summaryLabel.textContent = '📝 Summary';
    summaryLabel.style.cssText = 'color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;';
    summarySection.appendChild(summaryLabel);

    if (resource.summary && resource.summary.length > 0) {
        const summaryList = document.createElement('ul');
        summaryList.style.cssText = `
            list-style: none;
            padding: 0;
            margin: 0;
        `;
        resource.summary.forEach(function (point) {
            const li = document.createElement('li');
            li.textContent = '• ' + point;
            li.style.cssText = `
                padding: 0.75rem;
                margin-bottom: 0.5rem;
                background: rgba(255, 255, 255, 0.03);
                border-left: 3px solid #667eea;
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.85);
                line-height: 1.6;
            `;
            summaryList.appendChild(li);
        });
        summarySection.appendChild(summaryList);
    } else {
        const noSummary = document.createElement('p');
        noSummary.textContent = 'No summary available';
        noSummary.style.color = 'rgba(255, 255, 255, 0.5)';
        summarySection.appendChild(noSummary);
    }

    // Assemble modal
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(title);
    modalContent.appendChild(subjectSection);
    modalContent.appendChild(topicsSection);
    modalContent.appendChild(summarySection);
    modal.appendChild(modalContent);

    // Close on overlay click
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });

    // Close on Escape key
    function handleEscape(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleEscape);
        }
    }
    document.addEventListener('keydown', handleEscape);

    // Add to DOM
    document.body.appendChild(modal);
}

