import fs from 'fs';

const filePath = 'server/routes.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = /const endpoints = \[\s+`https:\/\/www\.flipedu\.net\/api\/v2\/branches\?sys=0&brand=\${encodeURIComponent\(trimmedBrandNo\)}`,(\s+)\];/;

const replacement = `const endpoints = [
        \`https://www.flipedu.net/api/v2/branches?sys=0&brand=\${encodeURIComponent(trimmedBrandNo)}\`,
        \`https://dev.flipedu.net/api/v2/branches?sys=0&brand=\${encodeURIComponent(trimmedBrandNo)}\`,
        // Also try LMS auth variants if available
        \`https://lms.flipedu.net/api/auth/branches?brandNo=\${encodeURIComponent(trimmedBrandNo)}\`,
        \`https://dev.lms.flipedu.net/api/auth/branches?brandNo=\${encodeURIComponent(trimmedBrandNo)}\`,
      ];`;

if (content.includes('branches?sys=0&brand=')) {
    const updatedContent = content.replace(target, replacement);
    if (updatedContent !== content) {
        fs.writeFileSync(filePath, updatedContent);
        console.log('Successfully updated branch endpoints');
    } else {
        // Try a simpler match if regex fails
        const simpleTarget = "const endpoints = [\n        `https://www.flipedu.net/api/v2/branches?sys=0&brand=${encodeURIComponent(trimmedBrandNo)}`,\n      ];";
        const updatedContent2 = content.replace(simpleTarget, replacement);
        if (updatedContent2 !== content) {
            fs.writeFileSync(filePath, updatedContent2);
            console.log('Successfully updated branch endpoints (simple match)');
        } else {
             console.log('Target not found in file');
             // Print out a snippet to see what's wrong
             const index = content.indexOf('const endpoints = [');
             console.log('Snippet around target:', JSON.stringify(content.substring(index, index + 200)));
        }
    }
} else {
    console.log('branches?sys=0&brand= not found');
}
