import { exec } from 'child_process';
import bodyParser from 'body-parser';
import crypto from 'node:crypto';

const HEADER_TEMPLATE = 'invite_template_header.png';
const FOOTER_TEMPLATE = 'invite_template_footer.png';
const BASE_TEMPLATE = 'invite_template.png';
const EXTENSION_DIR = './extensions/directus-extension-generate-invitations-endpoint';
const OUTPUT_DIR = `./${EXTENSION_DIR}/output`;
const BIN_DIR = `./${EXTENSION_DIR}/bin`;
const GENERATE = `${BIN_DIR}/generate.sh`;
const UPLOAD_DIR = './uploads';

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

export default {
    id: 'generate-invitations',
    handler: async (router, { getSchema, services }) => {
        const { FilesService } = services;
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
                const outputDir = `${OUTPUT_DIR}/${crypto.createHash('md5').update(Date.now().toString()).digest('hex')}`;

                // Process each invite
                const rtn = [];
                for ( let i = 0; i < invitations.length; i++ ) {
                    const gen = await generate({invitation: invitations[i], details, headerTemplate, footerTemplate, outputDir });
                    rtn.push(gen);
                }

                // Return the invite codes that have been processed
                return res.send(rtn);
            }
            catch (err) {
                return res.status(500).send({ error: `Caught error [${err}]` });
            }
        }
    )}
};
