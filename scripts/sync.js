import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import md5 from 'md5';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseKey.includes('your_service_role_key_here')) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
    console.log('🔄 Starting Sync...');

    // 1. Get all HTML files in dashboards/
    const files = await glob('dashboards/*.html');
    console.log(`📂 Found ${files.length} HTML files.`);

    for (const file of files) {
        const filename = path.basename(file);
        const id = filename; // Use filename as ID
        const content = await fs.readFile(file, 'utf-8');
        const hash = md5(content);
        
        // Extract basic metadata (naive regex, can be improved)
        const titleMatch = content.match(/<title>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1] : filename;

        // Check if exists/changed
        const { data: existing } = await supabase
            .from('dashboards')
            .select('hash')
            .eq('id', id)
            .single();

        if (existing && existing.hash === hash) {
            console.log(`✅ [Skipped] ${filename} (No changes)`);
            continue;
        }

        // Upsert
        const { error } = await supabase
            .from('dashboards')
            .upsert({
                id: id,
                title: title,
                content: content,
                hash: hash,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error(`❌ [Error] Failed to sync ${filename}:`, error.message);
        } else {
            console.log(`🚀 [Synced] ${filename}`);
        }
    }
    
    console.log('🎉 Sync Complete!');
}

sync();
