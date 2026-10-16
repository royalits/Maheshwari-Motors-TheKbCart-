import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "../index";

const getDatePickers = () => screen.getAllByLabelText("Pick date");
const getCalendarButtons = () =>
  screen.getAllByRole("button", { name: "Choose date" });

const mockShowPicker = (picker) => {
  const showPicker = vi.fn();
  Object.defineProperty(picker, "showPicker", {
    configurable: true,
    value: showPicker,
  });
  return showPicker;
};

describe("Input date calendar button", () => {
  it("opens only its associated picker on each click", () => {
    render(
      <>
        <Input type="date" calendarButton value="2026-10-16" onChange={vi.fn()} />
        <Input type="date" calendarButton value="2026-10-16" onChange={vi.fn()} />
      </>,
    );
    const pickers = getDatePickers();
    const buttons = getCalendarButtons();
    const startShowPicker = mockShowPicker(pickers[0]);
    const endShowPicker = mockShowPicker(pickers[1]);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[0]);
    expect(startShowPicker).toHaveBeenCalledTimes(2);
    expect(endShowPicker).not.toHaveBeenCalled();

    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[0]);
    expect(startShowPicker).toHaveBeenCalledTimes(3);
    expect(endShowPicker).toHaveBeenCalledTimes(1);
  });

  it("falls back to focusing and clicking the native input when showPicker is unavailable", () => {
    render(<Input type="date" calendarButton value="" onChange={vi.fn()} />);
    const picker = getDatePickers()[0];
    const focus = vi.spyOn(picker, "focus");
    const click = vi.spyOn(picker, "click");

    fireEvent.click(getCalendarButtons()[0]);

    expect(focus).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("keeps date selection and DD/MM/YYYY display in sync after rerender", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Input type="date" calendarButton value="2026-10-16" onChange={onChange} />,
    );
    const picker = getDatePickers()[0];

    fireEvent.change(picker, { target: { value: "2026-11-05" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-05", expect.anything());

    rerender(
      <Input type="date" calendarButton value="2026-11-05" onChange={onChange} />,
    );
    expect(screen.getByPlaceholderText("dd/mm/yyyy")).toHaveValue("05/11/2026");

    fireEvent.click(getCalendarButtons()[0]);
    expect(getDatePickers()[0]).toHaveValue("2026-11-05");
  });

  it("opens the picker from keyboard activation of the calendar button", () => {
    render(<Input type="date" calendarButton value="" onChange={vi.fn()} />);
    const showPicker = mockShowPicker(getDatePickers()[0]);

    fireEvent.click(getCalendarButtons()[0], { detail: 0 });

    expect(showPicker).toHaveBeenCalledOnce();
  });
});
