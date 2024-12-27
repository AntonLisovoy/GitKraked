const asar = require('@electron/asar');
const path = require('path');
const fs = require('fs');

const LogType = {
    USAGE: 'USAGE',
    INFO: 'INFO',
    ERROR: 'ERROR',
    SUCCESS: 'SUCCESS',
};

function log(type, message) {
    console.log(`[${type}] ${message}`);
}

function isFileType(filePath, type) {
    return path.extname(filePath).toLowerCase() === type;
}

function getDirectoryPath(filePath) {
    return path.dirname(filePath);
}

function parseJSONFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
}

function applyPatches(basePath, patches) {
    for (const patch of patches) {
        const filePath = path.join(basePath, patch.file);
        if (!fs.existsSync(filePath)) {
            return false;
        }

        let data = fs.readFileSync(filePath, 'utf-8');
        if (!data.includes(patch.find)) {
            return false;
        }

        let newData = data.replace(patch.find, patch.replace);
        fs.writeFileSync(filePath, newData, 'utf-8');
    }

    return true;
}

async function main() {
    if (process.argv.length !== 4) {
        log(LogType.USAGE, 'node gitkraked.js [app.asar] [patch.json]');
        return;
    }

    const asarFilePath = process.argv[2];
    if (!isFileType(asarFilePath, '.asar')) {
        log(LogType.ERROR, 'The first argument must be an .asar file.');
        return;
    }

    const patchFilePath = process.argv[3];
    if (!isFileType(patchFilePath, '.json')) {
        log(LogType.ERROR, 'The second argument must be a .json file.');
        return;
    }

    const extractPath = path.join(getDirectoryPath(asarFilePath), 'extracted');
    if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath);
    }

    log(LogType.INFO, 'Extracting .asar file.');
    asar.extractAll(asarFilePath, extractPath);

    const packageDataPath = path.join(extractPath, 'package.json');
    if (!fs.existsSync(packageDataPath)) {
        log(LogType.ERROR, 'package.json missing from extracted app.asar.');
        return;
    }

    const packageData = parseJSONFile(packageDataPath);
    const patchData = parseJSONFile(patchFilePath);

    if (!packageData || !patchData) {
        log(LogType.ERROR, 'Couldn\'t read package or patch data.');
        return;
    }

    if (packageData.version !== patchData.version) {
        log(LogType.ERROR, 'Version mismatch between app.asar and patch file.');
        return;
    }

    log(LogType.INFO, 'Applying patches.');
    if (!applyPatches(extractPath, patchData.patches)) {
        log(LogType.ERROR, 'Failed to apply patches.');
        return;
    }

    // Rename old app.asar to app.asar.old
    fs.renameSync(asarFilePath, asarFilePath + '.old');

    // Create new package with patched files
    await asar.createPackage(extractPath, asarFilePath);
    log(LogType.SUCCESS, `Applied ${patchData.patches.length} patches.`);

    // Delete directory we extracted the original app.asar file into
    log(LogType.INFO, 'Cleaning up.');
    fs.rmSync(extractPath, { recursive: true, force: true });

    log(LogType.SUCCESS, 'Done!');
}

main();
