async function runCode() {
    const LOOP_LIMIT = 100;
    const GLOBAL_EXEC_LIMIT = 50000;
    const MAX_RECURSION = 300;
    const MAX_CALLS_PER_LINE = 200;

    let globalExecCount = 0;
    let recursionDepth = 0;
    let callCounterPerLine = {};

    function guard(lineNumber = -1) {
        if (++globalExecCount > GLOBAL_EXEC_LIMIT) {
            outputDiv.innerHTML += "[ERRO] Execução interrompida (proteção global).\n";
            throw new Error("Execução destruída");
        }

        if (lineNumber !== -1) {
            callCounterPerLine[lineNumber] = (callCounterPerLine[lineNumber] || 0) + 1;

            if (callCounterPerLine[lineNumber] > MAX_CALLS_PER_LINE) {
                outputDiv.innerHTML += "[ERRO] Possível fork-bomb detectada e destruída.\n";
                throw new Error("Fork bomb destruída");
            }
        }
    }

    function enterFunction() {
        if (++recursionDepth > MAX_RECURSION) {
            outputDiv.innerHTML += "[ERRO] Recursão excessiva bloqueada.\n";
            throw new Error("Explosão recursiva");
        }
    }

    function exitFunction() {
        recursionDepth--;
    }

    const code = document.getElementById('code').value;
    const outputDiv = document.getElementById('output');
    const varsDiv = document.getElementById('vars');
    const inputArea = document.getElementById('inputArea');
    outputDiv.innerHTML = '';
    varsDiv.innerHTML = '';
    inputArea.innerHTML = '';

    const vars = {};
    const functions = {};
    const lines = code.replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
    let currentLine = 0;
    let lastWrite = '';

    function killLoop() {
        outputDiv.innerHTML += "[ERRO] Loop infinito detectado e destruído.\n";
        throw new Error("Loop infinito");
    }

    function fixOperators(expr) {
        return expr
            .replace(/\band\b/gi, '&&')
            .replace(/\bor\b/gi, '||')
            .replace(/\bnao\b/gi, '!')
            .replace(/<>/g, '!=')
            .replace(/([^<>=!])=([^=])/g, '$1==$2');
    }

    function evalExpr(expr, localVars = {}, ln = -1) {
        guard(ln);
        try {
            expr = fixOperators(expr);
            const gvNames = Object.keys(vars);
            const gvValues = gvNames.map(k => vars[k].valor);
            const lvNames = Object.keys(localVars);
            const lvValues = lvNames.map(k => localVars[k]);

            return Function(...lvNames.concat(gvNames), 'return ' + expr)(...lvValues, ...gvValues);
        } catch {
            return expr.replace(/['"]/g, '');
        }
    }

    async function executeLine(line, localVars = {}, ln = -1) {
        guard(ln);

        line = line.trim();
        if (!line || line.startsWith('//')) return;

        const lower = line.toLowerCase();
        if (lower === 'fimse' || lower === 'fimenquanto' || lower === 'fimpara' || lower === 'fimfuncao' || lower === 'senao') {
            return;
        }

        if (/^var$/i.test(line)) return;

        const decl = line.match(/^([a-zA-Z_]\w*)\s*:\s*(caractere|inteiro|real|booleano)/i);
        if (decl) {
            guard(ln);
            const nome = decl[1];
            const tipo = decl[2].toLowerCase();
            vars[nome] = {
                tipo,
                valor: tipo === 'caractere' ? '' :
                       tipo === 'booleano' ? false :
                       0
            };
            return;
        }

        const read = line.match(/^leia\((.*)\)$/i);
        if (read) {
            guard(ln);
            const nome = read[1].trim();
            await new Promise(resolve => {
                inputArea.innerHTML = '';
                const label = document.createElement('label');
                label.textContent = (lastWrite ? lastWrite + " " : "") + nome + ":";
                const input = document.createElement('input');
                const btn = document.createElement('button');
                btn.textContent = "Enviar";

                btn.onclick = () => {
                    let v = input.value;
                    if (vars[nome]) {
                        if (vars[nome].tipo === 'inteiro') v = parseInt(v) || 0;
                        else if (vars[nome].tipo === 'real') v = parseFloat(v) || 0;
                        else if (vars[nome].tipo === 'booleano') v = v.toLowerCase() === 'verdadeiro';
                        vars[nome].valor = v;
                    }
                    outputDiv.innerHTML += v + "\n";
                    inputArea.innerHTML = '';
                    resolve();
                };

                inputArea.appendChild(label);
                inputArea.appendChild(document.createElement('br'));
                inputArea.appendChild(input);
                inputArea.appendChild(btn);
                input.focus();
            });
            return;
        }

        const write = line.match(/^(escreva|escreval)\((.*)\)$/i);
        if (write) {
            guard(ln);
            const val = evalExpr(write[2], localVars, ln);
            lastWrite = val;
            outputDiv.innerHTML += val + "\n";
            return;
        }

        const asg = line.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (asg) {
            guard(ln);
            const nome = asg[1];
            const expr = asg[2];
            const v = evalExpr(expr, localVars, ln);
            if (nome in localVars) localVars[nome] = v;
            else if (vars[nome]) vars[nome].valor = v;
            return;
        }

        const call = line.match(/^(\w+)\((.*)\)$/);
        if (call && functions[call[1]]) {
            guard(ln);
            enterFunction();

            const fname = call[1];
            const args = call[2].split(',').map(a => evalExpr(a.trim(), localVars, ln));
            const fvars = {};
            if (functions[fname].params) {
                functions[fname].params.forEach((p, idx) => fvars[p] = args[idx]);
            }

            for (const ln2 of functions[fname].body) {
                await executeLine(ln2, fvars, ln);
            }

            exitFunction();
            return;
        }
    }

    try {
        while (currentLine < lines.length) {
            guard(currentLine);

            const raw = lines[currentLine].trim();

            if (raw === '') {
                currentLine++;
                continue;
            }

            if (raw.match(/^enquanto\s+(.*)\s+faca$/i)) {
                const w = raw.match(/^enquanto\s+(.*)\s+faca$/i);
                const cond = w[1];
                const start = currentLine + 1;
                let end = start;
                let depth = 1;

                while (end < lines.length) {
                    const L = lines[end].trim().toLowerCase();
                    if (L.startsWith('enquanto')) depth++;
                    if (L === 'fimenquanto') depth--;
                    if (depth === 0) break;
                    end++;
                }

                let count = 0;
                while (evalExpr(cond, {}, currentLine)) {
                    guard(currentLine);
                    if (++count > LOOP_LIMIT) killLoop();
                    for (let i = start; i < end; i++) {
                        if (lines[i].trim() && !lines[i].trim().toLowerCase().startsWith('fimenquanto')) {
                            guard(i);
                            await executeLine(lines[i], {}, i);
                        }
                    }
                }

                currentLine = end + 1;
                continue;
            }

            else if (/^para\s+(\w+)\s*=\s*(.*)\s+ate\s+(.*?)(?:\s+passo\s+(.*))?$/i.test(raw)) {
                const m = raw.match(/^para\s+(\w+)\s*=\s*(.*)\s+ate\s+(.*?)(?:\s+passo\s+(.*))?$/i);
                const name = m[1];
                const startV = evalExpr(m[2], {}, currentLine);
                const endV = evalExpr(m[3], {}, currentLine);
                const step = m[4] ? evalExpr(m[4], {}, currentLine) : 1;

                const l0 = currentLine + 1;
                let l1 = l0;
                let depth = 1;

                while (l1 < lines.length) {
                    const L = lines[l1].trim().toLowerCase();
                    if (L.startsWith('para')) depth++;
                    if (L === 'fimpara') depth--;
                    if (depth === 0) break;
                    l1++;
                }

                let count = 0;
                for (let i = startV; step > 0 ? i <= endV : i >= endV; i += step) {
                    guard(currentLine);
                    if (++count > LOOP_LIMIT) killLoop();
                    if (vars[name]) vars[name].valor = i;
                    for (let j = l0; j < l1; j++) {
                        if (lines[j].trim() && !lines[j].trim().toLowerCase().startsWith('fimpara')) {
                            guard(j);
                            await executeLine(lines[j], {}, j);
                        }
                    }
                }

                currentLine = l1 + 1;
                continue;
            }

            // FUNCAO
            else if (/^funcao\s+(\w+)\((.*)\)/i.test(raw)) {
                guard(currentLine);

                const m = raw.match(/^funcao\s+(\w+)\((.*)\)/i);
                const fname = m[1];
                const paramsStr = m[2].trim();
                const params = paramsStr ? paramsStr.split(',').map(p => p.trim()) : [];

                functions[fname] = { params, body: [] };

                let e = currentLine + 1;
                let depth = 1;

                while (e < lines.length) {
                    const L = lines[e].trim().toLowerCase();
                    if (L.startsWith('funcao')) depth++;
                    if (L === 'fimfuncao') depth--;
                    if (depth === 0) break;
                    functions[fname].body.push(lines[e]);
                    e++;
                }

                currentLine = e + 1;
                continue;
            }

            else if (/^se\s+(.+)\s+entao$/i.test(raw)) {
                const condMatch = raw.match(/^se\s+(.+)\s+entao$/i);
                const cond = condMatch[1];

                let i = currentLine + 1;
                let depth = 1;
                let inElse = false;

                const blocoEntao = [];
                const blocoSenao = [];

                while (i < lines.length && depth > 0) {
                    const linha = lines[i].trim();
                    const linhaLower = linha.toLowerCase();

                    if (linhaLower.startsWith('se ')) depth++;
                    if (linhaLower === 'fimse') {
                        depth--;
                        if (depth === 0) break;
                    }

                    if (linhaLower === 'senao' && depth === 1) {
                        inElse = true;
                        i++;
                        continue;
                    }

                    if (depth > 0) {
                        if (!inElse) {
                            blocoEntao.push({ texto: linha, idx: i });
                        } else {
                            blocoSenao.push({ texto: linha, idx: i });
                        }
                    }
                    i++;
                }

                const condResult = evalExpr(cond, {}, currentLine);
                const blocoParaExecutar = condResult ? blocoEntao : blocoSenao;

                for (const item of blocoParaExecutar) {
                    if (item.texto) {
                        await executeLine(item.texto, {}, item.idx);
                    }
                }

                currentLine = i + 1;
                continue;
            }

            else {
                await executeLine(raw, {}, currentLine);
                currentLine++;
            }
        }
    } catch (e) {
    }

    varsDiv.innerHTML = '';
    for (const [n, o] of Object.entries(vars)) {
        varsDiv.innerHTML += n + ' = ' + o.valor + '\n';
    }
}
