import { exec } from 'child_process';
import bodyParser from 'body-parser';
import fs from 'node:fs';

const HEADER_TEMPLATE = 'invite_template_header.png';
const FOOTER_TEMPLATE = 'invite_template_footer.png';
const BASE_TEMPLATE = 'invite_template.png';

const ROOT_DIR = process.env?.PWD || '/directus'
const UPLOAD_DIR = `${ROOT_DIR}/uploads`;

// Set the extensions directory
const EXTENSION_DIRS = [
    `${ROOT_DIR}/extensions/directus-extension-generate-invitations-endpoint`,
    `${ROOT_DIR}/node_modules/directus-extension-generate-invitations-endpoint`
];
let EXTENSION_DIR;
EXTENSION_DIRS.forEach((dir) => {
    if (fs.existsSync(dir)) {
        EXTENSION_DIR = dir;
    }
});

const OUTPUT_DIR = `${EXTENSION_DIR}/output`;
const GENERATE = `${EXTENSION_DIR}/bin/generate.sh`;
const COMBINE = `${EXTENSION_DIR}/bin/combine.sh`;

const timestamp = () => {
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    const d = new Date();
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
}

const generate = ({ invitation, details, headerTemplate, footerTemplate, outputDir }) => {
    return new Promise(async (resolve, reject) => {
        try {

            // Set Generate Arguments
            const baseTemplate = `${EXTENSION_DIR}/share/${BASE_TEMPLATE}`;
            const domain = details?.website_url;
            const id = invitation?.id;
            const inviteCode = invitation?.invite_code;
            const inviteName = invitation?.name;

            // Build and run generate script
            const cmd = `${GENERATE} "${inviteCode}" "${inviteName}" "${domain}" "${outputDir}" "${headerTemplate}" "${footerTemplate}" "${baseTemplate}"`;
            exec(cmd, (err, stdout, stderr) => {
                console.log(stdout);
                if ( stderr ) console.log(stderr);
                if ( err ) console.log(err);
                if ( err || (stdout && stdout.startsWith('ERROR')) ) {
                    const errmsg = stdout.startsWith('ERROR') ? stdout : err;
                    const rejmsg = `Could not generate invite ${inviteCode || id} [${errmsg}]`;
                    return reject(rejmsg);
                }
                return resolve({
                    id,
                    code: inviteCode,
                    name: inviteName,
                    doman: domain,
                    templates: {
                        base: baseTemplate,
                        header: headerTemplate,
                        footer: footerTemplate
                    },
                    output: `${outputDir}/invites/${inviteCode}.png`
                });
            });
        }
        catch (err) {
            return reject(err);
        }
    });
}

const combine = ({ outputDir }) => {
    return new Promise(async (resolve, reject) => {
        try {
            const input = `${outputDir}/invites/`;
            const output = `${outputDir}/invitations.pdf`;
            const cmd = `${COMBINE} "${input}" "${output}"`;
            exec(cmd, (err, stdout, stderr) => {
                console.log(stdout);
                if ( stderr ) console.log(stderr);
                if ( err || (stdout && stdout.startsWith('ERROR')) ) {
                    const errmsg = stdout.startsWith('ERROR') ? stdout : err;
                    const rejmsg = `Could not combine invites from ${input} [${errmsg}]`;
                    return reject(rejmsg);
                }
                return resolve({ input, output });
            });
        }
        catch (err) {
            return reject(err);
        }
    });
}

export default {
    id: 'generate-invitations',
    handler: async (router, { getSchema, services }) => {
        const { FilesService, FoldersService } = services;
        router.use(bodyParser.text({ type: 'text/plain' }));
        router.post('/', async (req, res) => {
            try {
                const body = JSON.parse(req?.body || '{"invitations": [], "details": {}}');
                const invitations = body?.invitations || [];
                const details = body?.details || {};

                // Check for user-provided templates
                const filesService = new FilesService({
                    schema: await getSchema(),
                    accountability: req.accountability
                });
                const userHeaders = await filesService.readByQuery({
                    filter: { filename_download: { _eq: HEADER_TEMPLATE } },
                    sort: [ '-modified_on' ]
                });
                const userFooters = await filesService.readByQuery({
                    filter: { filename_download: { _eq: FOOTER_TEMPLATE } },
                    sort: [ '-modified_on' ]
                });

                // Set header and footer (prefer user-provided templates, fallback to extension templates)
                const headerTemplate = userHeaders && userHeaders.length > 0 ? `${UPLOAD_DIR}/${userHeaders[0].filename_disk}` : `${EXTENSION_DIR}/share/${HEADER_TEMPLATE}`;
                const footerTemplate = userFooters && userFooters.length > 0 ? `${UPLOAD_DIR}/${userFooters[0].filename_disk}` : `${EXTENSION_DIR}/share/${FOOTER_TEMPLATE}`;

                // Set output directory
                const ts = timestamp();
                const outputDir = `${OUTPUT_DIR}/${ts}`;

                // Process each invite
                const processed = [];
                for ( let i = 0; i < invitations.length; i++ ) {
                    const gen = await generate({invitation: invitations[i], details, headerTemplate, footerTemplate, outputDir });
                    processed.push(gen);
                }

                // Combine the invites
                const { output } = await combine({ outputDir });

                // Create the invitations folder, if not found
                const foldersService = new FoldersService({
                    schema: await getSchema(),
                    accountability: req.accountability
                });
                const invitationsFolderQuery = await foldersService.readByQuery({
                    filter: { name: { _eq: 'invitations' } }
                });

                // Set the invitations folder id
                let invitationsFolderId;
                if ( invitationsFolderQuery.length === 0 ) {
                    invitationsFolderId = await foldersService.createOne({ name: 'invitations' });
                }
                else {
                    invitationsFolderId = invitationsFolderQuery[0].id;
                }

                // Save the file
                const outputStream = fs.createReadStream(output);
                const fileKey = await filesService.uploadOne(outputStream, {
                    title: `invitations-${ts}`,
                    description: `Generated invitations for: ${processed.map((e) => e.name).join(', ')}`,
                    filename_download: `invitations-${ts}.pdf`,
                    type: 'application/pdf',
                    folder: invitationsFolderId,
                    storage: 'local',
                });
                if ( !fileKey ) return res.status(500).send({ error: 'Could not save pdf to files' });

                return res.send({ processed, output, fileKey, timestamp: ts });
            }
            catch (err) {
                return res.status(500).send({ error: `Caught error [${err}]` });
            }
        }
    )}
};
