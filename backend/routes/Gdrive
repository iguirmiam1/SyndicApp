// ── Google Drive Storage ──────────────────────────────────────────────────────
// Prérequis :
//   1. Google Cloud Console → APIs → activer "Google Drive API"
//   2. IAM → Créer un Service Account → télécharger clé JSON
//   3. Partager votre dossier Drive avec l'email du service account (éditeur)
//   4. Variables d'env Render :
//        GOOGLE_SERVICE_ACCOUNT_JSON = contenu JSON de la clé (stringify)
//        GOOGLE_DRIVE_FOLDER_ID = ID du dossier (dans l'URL Drive)

const { Readable } = require('stream');

const isConfigured = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const getDrive = () => {
  if (!isConfigured()) return null;
  const { google } = require('googleapis');
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch(e) {
    console.error('❌ GOOGLE_SERVICE_ACCOUNT_JSON invalide:', e.message);
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
};

// ── Upload vers Google Drive ──────────────────────────────────────────────────
const uploadToGDrive = async (file, residenceId) => {
  const drive = getDrive();
  if (!drive) return null;

  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Créer le fichier dans Drive
    const { data } = await drive.files.create({
      requestBody: {
        name: fileName,
        ...(folderId ? { parents: [folderId] } : {}),
        description: `SyndicPro - Résidence ${residenceId}`,
      },
      media: {
        mimeType: file.mimetype,
        body: Readable.from(file.buffer),
      },
      fields: 'id,name,webViewLink,webContentLink,size',
    });

    // Rendre le fichier accessible à tous (lecture seule)
    await drive.permissions.create({
      fileId: data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    console.log(`📁 Google Drive upload: ${data.name} (${data.id})`);
    return {
      url: data.webViewLink,           // URL de visualisation
      downloadUrl: data.webContentLink, // URL de téléchargement direct
      driveFileId: data.id,
    };
  } catch(e) {
    console.error('❌ Google Drive upload failed:', e.message);
    return null;
  }
};

// ── Supprimer un fichier Drive ────────────────────────────────────────────────
const deleteFromGDrive = async (fileId) => {
  const drive = getDrive();
  if (!drive || !fileId) return;
  try {
    await drive.files.delete({ fileId });
    console.log(`🗑️  Google Drive delete: ${fileId}`);
  } catch(e) {
    console.warn('Drive delete failed:', e.message);
  }
};

module.exports = { uploadToGDrive, deleteFromGDrive, isConfigured };
