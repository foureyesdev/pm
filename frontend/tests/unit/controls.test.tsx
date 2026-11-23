import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CardComposer, ColumnName } from "../../app/board/ColumnControls";

function EditableName() {
  const [name, setName] = useState("Ready");
  return <><ColumnName name={name} onSave={setName} /><button>Next control</button></>;
}

describe("column name", () => {
  it("selects the current name, commits with Enter, and returns focus", async () => {
    const user = userEvent.setup();
    render(<EditableName />);
    await user.click(screen.getByRole("button", { name: "Rename Ready column" }));
    const input = screen.getByRole("textbox", { name: "Column name" });
    expect(input).toHaveFocus();
    await user.keyboard("  Queued  {Enter}");
    expect(screen.getByRole("button", { name: "Rename Queued column" })).toHaveFocus();
  });

  it("saves on blur without taking focus from the next control", async () => {
    const user = userEvent.setup();
    render(<EditableName />);
    await user.click(screen.getByRole("button", { name: "Rename Ready column" }));
    await user.keyboard("Reviewing");
    await user.tab();
    expect(screen.getByRole("button", { name: "Rename Reviewing column" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next control" })).toHaveFocus();
  });

  it.each(["Replacement{Escape}", "   {Enter}"])("restores the name for input %s", async (keys) => {
    const user = userEvent.setup();
    render(<EditableName />);
    await user.click(screen.getByRole("button", { name: "Rename Ready column" }));
    await user.keyboard(keys);
    expect(screen.getByRole("button", { name: "Rename Ready column" })).toHaveFocus();
  });
});

async function openComposer() {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<CardComposer columnName="Ready" onAdd={onAdd} />);
  await user.click(screen.getByRole("button", { name: "Add card" }));
  const form = within(screen.getByRole("form", { name: "New card in Ready" }));
  return { user, onAdd, form };
}

describe("card composer", () => {
  it("requires a nonblank title and supports keyboard submission with empty details", async () => {
    const { user, onAdd, form } = await openComposer();
    expect(form.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await user.keyboard("   {Enter}");
    expect(form.getByRole("button", { name: "Add card" })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
    await user.keyboard("Launch notes{Enter}");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Launch notes", "");
    expect(screen.getByRole("button", { name: "Add card" })).toHaveFocus();
  });

  it("submits both fields and clears the draft for the next card", async () => {
    const { user, onAdd, form } = await openComposer();
    await user.type(form.getByLabelText("Title"), "Launch notes");
    await user.type(form.getByLabelText(/Details/), "  Review the copy.  ");
    await user.click(form.getByRole("button", { name: "Add card" }));
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Launch notes", "Review the copy.");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText(/Details/)).toHaveValue("");
  });

  it.each(["Escape", "Cancel"])("discards a draft via %s and restores focus", async (method) => {
    const { user, onAdd, form } = await openComposer();
    await user.keyboard("Unfinished");
    if (method === "Escape") await user.keyboard("{Escape}");
    else await user.click(form.getByRole("button", { name: "Cancel" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add card" })).toHaveFocus();
  });
});
