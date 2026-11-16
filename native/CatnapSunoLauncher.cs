// SCRIPT_VERSION 0.6.0 — auditable Windows launcher for the Node stdio host.
// Install-Windows.ps1 substitutes only the two fixed, installer-verified paths.
// No web server, token files, shell command interpreter or dynamic arguments.
using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

internal static class CatnapSunoLauncher
{
    private const string NodePath = @"__CATNAP_NODE_PATH__";
    private const string HostPath = @"__CATNAP_HOST_PATH__";

    public static int Main()
    {
        try
        {
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = NodePath;
            start.Arguments = "\"" + HostPath + "\"";
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            using (Process child = Process.Start(start))
            {
                Task input = Task.Run(async delegate
                {
                    try { await Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream); }
                    catch (IOException) { }
                    finally { try { child.StandardInput.Close(); } catch (InvalidOperationException) { } }
                });
                // Drain stderr without reflecting potentially sensitive provider
                // diagnostics into a browser page or persistent log.
                Task errors = child.StandardError.BaseStream.CopyToAsync(Stream.Null);
                child.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput());
                child.WaitForExit();
                errors.Wait();
                GC.KeepAlive(input);
                return child.ExitCode;
            }
        }
        catch
        {
            // A broken pipe may occur when Chrome deliberately closes a
            // sendNativeMessage process. Never emit unframed output or tokens.
            return 1;
        }
    }
}
