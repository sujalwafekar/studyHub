const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

// Set global options for all functions
setGlobalOptions({ maxInstances: 10 });

// Helper function to create the prompt
function createPrompt(text) {
    return `From the following study material:
- Identify subject from this list only: Physics, Chemistry, Maths, Biology, Computer Science, Other
- Give 5 topic keywords
- Give 5 bullet point summary for exam revision

Text: ${text}

Return format:
Subject:
Topics:
Summary:`;
}

// Helper function to parse Gemini response
function parseGeminiResponse(responseText) {
    const result = {
        subject: 'Other',
        topics: [],
        summary: []
    };

    // Extract subject
    const subjectMatch = responseText.match(/Subject:\s*([^\n]+)/i);
    if (subjectMatch) {
        const detectedSubject = subjectMatch[1].trim();
        const validSubjects = ['Physics', 'Chemistry', 'Maths', 'Biology', 'Computer Science'];

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

    return result;
}

// 2nd Gen Cloud Function to analyze PDF text with Gemini
exports.analyzePDF = onCall(async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
        throw new Error('User must be authenticated to analyze PDFs');
    }

    // Validate input
    if (!request.data.text || typeof request.data.text !== 'string') {
        throw new Error('The function must be called with a "text" argument');
    }

    try {
        // Use environment variable for API key
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not set in environment variables");
        }
        const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

        // Prepare request
        const prompt = createPrompt(request.data.text);
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        // Call Gemini API
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);

            // Return default values on API failure
            return {
                subject: 'Other',
                topics: [],
                summary: [],
                error: 'AI analysis failed'
            };
        }

        const responseData = await response.json();

        // Extract and parse response
        const responseText = responseData.candidates[0].content.parts[0].text;
        const parsedResult = parseGeminiResponse(responseText);

        console.log('Successfully analyzed PDF:', parsedResult.subject);
        return parsedResult;

    } catch (error) {
        console.error('Error in analyzePDF function:', error);

        // Return default values instead of throwing
        return {
            subject: 'Other',
            topics: [],
            summary: [],
            error: error.message
        };
    }
});
