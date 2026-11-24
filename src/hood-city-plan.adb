with Hood.Random;
with Hood.Units;

package body Hood.City.Plan is

   Free    : constant := 16#FF#;
   Blocked : constant := 16#FE#;

   Spin_Limit : constant := 100_000;
   Max_Tries  : constant := 16;

   Park_By_Mask : constant array (Integer_32 range 0 .. 15) of Integer_32 :=
     [26, 33, 25, 28, 29, 66, 31, 62, 32, 27, 67, 64, 30, 63, 65, 26];

   --  Ring positions 0 .. 7 around the centre cell, as cell indexes.
   Ring_Cells : constant array (Integer_32 range 0 .. 7) of Integer_32 := [0, 1, 2, 5, 8, 7, 6, 3];
   Centre     : constant := 4;

   type Loop_Label is
     (River_Turn, Rail_Column, Avenue_Column, Avenue_Row, City_Centre,
      Department_Store_Site, Civic_Site_Loop, Ring_Premium, Ring_Radio,
      Ring_Newspaper, Ring_School, Orphanage_Site, Employment_Site,
      Museum_Site, Baths_Site, Post_Site, Water_Plant_Site, Power_Plant_Site);

   type District_Seed is record
      X, Y       : Integer_32;
      Value      : Integer_32;
      Budget     : Integer_32;
      Jitter     : Integer_32;
      Floor      : Integer_32;
      Content_Id : Integer_32;
      Claimed    : Integer_32;
      Radius     : Integer_32;
   end record;

   G        : Hood.Random.Plan_Lcg;
   Stuck    : Boolean;
   Spins    : array (Loop_Label) of Integer_32;
   Grid_Val : array (Cell) of Integer_32;
   Grid_Id  : array (Cell) of Integer_32;

   River_Row    : array (Integer_32 range 0 .. W - 1) of Integer_32;
   River_Turned : array (Integer_32 range 0 .. W - 1) of Boolean;
   River_Delta  : array (Integer_32 range 0 .. W - 1) of Integer_32;
   River_Min, River_Max : Integer_32;
   Has_River, Has_Rail  : Boolean;
   Rail_Col : Integer_32;
   Cols : Hood.City.Avenue_Lines renames Avenue_Cols;
   Rows : Hood.City.Avenue_Lines renames Avenue_Rows;
   CX, CY   : Integer_32;
   Stores   : array (Integer_32 range 0 .. 5) of Point;
   Store_Count : Integer_32;
   Civics   : array (Integer_32 range 0 .. 5) of Point;
   Corners  : array (Integer_32 range 0 .. 3) of Point;
   Ds       : array (Integer_32 range 0 .. 11) of District_Seed;
   D_Count  : Integer_32;

   --  The placer's state (kept across tries, as in 1.2.91).
   Present_Count : array (Kind_Id) of Integer_32;  --  in units of 64
   Docks_Erased  : Boolean;
   Near          : array (Kind_Id) of Boolean;

   ----------------------------------------------------------------------
   --  Small helpers
   ----------------------------------------------------------------------

   function R return Integer_32 is
      V : Hood.Random.Plan_Value;
   begin
      Hood.Random.Plan_Next (G, V);
      return V;
   end R;

   procedure Skip is
   begin
      Ignored := R;
   end Skip;

   function U8 (V : Integer_32) return Integer_32 is (V mod 256);

   function Index_Of (X, Y : Integer_32) return Integer_32 is (Y * W + X);

   function Content_At (X, Y : Integer_32) return Integer_32 is
     (if Index_Of (X, Y) in Cell then Content (Index_Of (X, Y)) else -1);
   --  -1 where 1.2.91 reads past its array (never equal to a content id).

   procedure Set_LV (X, Y, V : Integer_32) is
   begin
      if Index_Of (X, Y) in Cell then
         Land_Value (Index_Of (X, Y)) := U8 (V);
      end if;
   end Set_LV;

   procedure Set_Grid (X, Y, V : Integer_32) is
   begin
      if Index_Of (X, Y) in Cell then
         Grid_Val (Index_Of (X, Y)) := U8 (V);
         Grid_Id (Index_Of (X, Y)) := Blocked;
      end if;
   end Set_Grid;

   function Turned_At (X : Integer_32) return Boolean is
     (X in River_Turned'Range and then River_Turned (X));

   procedure Spin (L : Loop_Label) is
   begin
      Spins (L) := Spins (L) + 1;
      if Spins (L) > Spin_Limit then
         Stuck := True;
      end if;
   end Spin;

   ----------------------------------------------------------------------
   --  Business placer
   ----------------------------------------------------------------------

   function Capacity (K : Kind_Id) return Integer_32 is
     (if Docks_Erased and then K = K_Docks then 0 else Kind_Capacity (K));

   function Capacity_Max (K : Kind_Id) return Integer_32 is
     (if Docks_Erased and then K = K_Docks then 0 else Kind_Capacity_Max (K));

   procedure Place (K : Kind_Id) is
   begin
      Present_Count (K) := Present_Count (K) + 64;
   end Place;

   function Spare (K : Kind_Id) return Boolean is
     (Present_Count (K) + 64 <= Capacity (K)
      or else (Capacity (K) = 0 and then Capacity_Max (K) >= Present_Count (K) + 64));

   function In_Window (K : Kind_Id; LV : Integer_32) return Boolean is
     (Kind_Lv_Min (K) <= LV and then Kind_Lv_Max (K) >= LV);

   procedure Open_Fill (I : Cell) is
   begin
      if not Fills (I).Present then
         Fills (I).Present := True;
         Fills (I).Uses := [others => None];
         Fills (I).Firms := 0;
      end if;
   end Open_Fill;

   procedure Add_Firm
     (I : Cell; Kind : Kind_Id; Cells : Cell_List; Count : Integer_32;
      Master : Integer_32)
   is
      F : Fill renames Fills (I);
   begin
      if F.Firms = Max_Firms then
         Overflow := True;
         return;
      end if;
      F.List (F.Firms) := (Kind => Kind, Count => Count, Cells => Cells, Master => Master);
      F.Firms := F.Firms + 1;
      for J in Integer_32 range 0 .. Count - 1 loop
         F.Uses (Cells (J)) := Business;
      end loop;
      Place (Kind);
   end Add_Firm;

   procedure Whole_Block (I : Cell; Kind : Kind_Id) is
   begin
      Open_Fill (I);
      Fills (I).Uses := [others => None];
      Fills (I).Firms := 0;
      Add_Firm (I, Kind, [0, 1, 2, 3, 4, 5, 6, 7, 8], 9, Ring_Cells (1));
   end Whole_Block;

   procedure Mark_Neighbours (X, Y : Integer_32) is
   begin
      Near := [others => False];
      for NY in Y - 1 .. Y + 1 loop
         for NX in X - 1 .. X + 1 loop
            if NX in 0 .. W - 1 and then NY in 0 .. H - 1
              and then Fills (Index_Of (NX, NY)).Present
            then
               declare
                  F : Fill renames Fills (Index_Of (NX, NY));
               begin
                  for J in Integer_32 range 0 .. F.Firms - 1 loop
                     Near (F.List (J).Kind) := True;
                  end loop;
               end;
            end if;
         end loop;
      end loop;
   end Mark_Neighbours;

   procedure Empty_Lots (I : Cell) is
   begin
      for J in Integer_32 range 0 .. 8 loop
         if J /= Centre and then Fills (I).Uses (J) = None then
            Fills (I).Uses (J) := Lot;
         end if;
      end loop;
   end Empty_Lots;

   function Ring_Cell (P : Integer_32) return Integer_32 is (Ring_Cells (P mod 8));

   Max_Choices : constant := 3 * Kind_Count;
   type Kind_List is array (Integer_32 range 0 .. Max_Choices - 1) of Integer_32;

   procedure Remove (L : in out Kind_List; Len : Integer_32; At_I : Integer_32) is
   begin
      for J in At_I .. Len - 2 loop
         L (J) := L (J + 1);
      end loop;
   end Remove;
   --  Removes item At_I of the first Len items; the caller shortens Len.

   --  Ring placement shared by the mixed and premium placers; returns the
   --  landmark content of a whole-ring kind, or -1.
   function Place_Ring
     (I : Cell; Picks : Kind_List; Len, Start, D : Integer_32) return Integer_32
   is
      P        : Integer_32 := Start;
      Occupied : Integer_32 := 0;
      Hd       : Integer_32 := 0;
      Landmark : Integer_32 := -1;
      Kind     : Integer_32;
      Size     : Integer_32;
      Cells    : Cell_List := [others => 0];
      Master   : Integer_32;
   begin
      loop
         Kind := Picks (Hd);
         Size := Kind_Size (Kind);
         if Size = 1 then
            Cells (0) := Ring_Cell (P);
            Add_Firm (I, Kind, Cells, 1, Cells (0));
            P := P + D;
            Occupied := Occupied + 1;
            Hd := Hd + 1;
         elsif Size /= 3 then
            if Size = 8 and then Occupied = 0 then
               for K in Integer_32 range 0 .. 7 loop
                  Cells (K) := Ring_Cell (P + K * D);
               end loop;
               Cells (8) := Centre;
               Add_Firm (I, Kind, Cells, 9, Cells (1));
               if Kind = K_Hotel_Large then
                  Landmark := Hotel_Large;
               elsif Kind = K_Department_Store then
                  Landmark := Department_Store;
               elsif Kind = K_Bank_Large then
                  Landmark := Bank_Large;
               end if;
               Occupied := Occupied + 8;
               Hd := Hd + 1;
            end if;
            Hd := Hd + 1;
         elsif P mod 2 = 0 then
            if Occupied <= 5 then
               Cells (0) := Ring_Cell (P);
               Cells (1) := Ring_Cell (P + D);
               Cells (2) := Ring_Cell (P + 2 * D);
               Master := (if Kind = K_Cab_Company or else Kind = K_Removals
                          then Cells (0) else Cells (1));
               Add_Firm (I, Kind, Cells, 3, Master);
               Occupied := Occupied + 3;
               P := P + 3 * D;
            end if;
            Hd := Hd + 1;
         elsif Occupied < 5 then
            P := P + D;  --  skip a cell; this kind is tried again at a corner
            Occupied := Occupied + 1;
         else
            Hd := Hd + 1;
         end if;
         exit when not (Occupied < 8 and then Hd < Len);
      end loop;
      return Landmark;
   end Place_Ring;

   function Commercial_First return Integer_32 is (Group_Start (0));
   function Commercial_Last return Integer_32 is (Group_Start (0) + Group_Count (0) - 1);
   function Industrial_First return Integer_32 is (Group_Start (1));
   function Industrial_Last return Integer_32 is (Group_Start (1) + Group_Count (1) - 1);

   --  Content 11 .. 14: one industrial business, else False (a plaza).
   function Eligible_Business (X, Y : Integer_32) return Boolean is
      I    : constant Cell := Index_Of (X, Y);
      LV   : Integer_32;
      L    : Kind_List := [others => 0];
      Len  : Integer_32 := 0;
      Keep : Integer_32 := 0;
   begin
      Skip;  --  two draws the placer makes before it looks
      Skip;
      LV := Land_Value (I);
      for K in Industrial_First .. Industrial_Last loop
         if Present_Count (K) + 64 <= Capacity (K) and then In_Window (K, LV) then
            L (Len) := K;
            Len := Len + 1;
         end if;
      end loop;
      if Len = 0 then
         for K in Industrial_First .. Industrial_Last loop
            if Capacity (K) = 0 and then Present_Count (K) + 64 <= Capacity_Max (K)
              and then In_Window (K, LV)
            then
               L (Len) := K;
               Len := Len + 1;
            end if;
         end loop;
      end if;
      if Len = 0 then
         return False;
      end if;
      Mark_Neighbours (X, Y);
      for J in Integer_32 range 0 .. Len - 1 loop
         if not Near (L (J)) then
            L (Keep) := L (J);
            Keep := Keep + 1;
         end if;
      end loop;
      if Keep = 0 then
         return False;
      end if;
      Whole_Block (I, L (R mod Keep));
      return True;
   end Eligible_Business;

   function Excluded (K : Integer_32) return Boolean is
     (K = K_Bank or else K = K_Department_Store or else K = K_Bank_Large);

   --  Leftover cells of the mixed placer: the first non-corner one becomes
   --  a yard, the first other one a soup kitchen, the rest paving.
   procedure Mixed_Leftovers (I : Cell) is
      Yard_Done, Soup_Done : Boolean := False;
      J : Integer_32;
   begin
      for Row in Integer_32 range 1 .. 3 loop
         for Col in Integer_32 range 1 .. 3 loop
            J := (Row - 1) * 3 + (Col - 1);
            if Fills (I).Uses (J) = None then
               if not (Col /= 2 and then Row /= 2) and then not Yard_Done then
                  Fills (I).Uses (J) := Yard;
                  Yard_Done := True;
               elsif not Soup_Done then
                  Fills (I).Uses (J) := Soup_Kitchen;
                  Soup_Done := True;
                  Place (K_Soup_Kitchen);
               else
                  Fills (I).Uses (J) := Paving;
               end if;
            end if;
         end loop;
      end loop;
   end Mixed_Leftovers;

   --  Content 15, 17, 18: up to eight commercial kinds around the ring;
   --  returns the landmark content of a whole-ring kind, or -1.
   function Mixed_Businesses (X, Y : Integer_32) return Integer_32 is
      I       : constant Cell := Index_Of (X, Y);
      V       : Integer_32;
      P, D    : Integer_32;
      LV      : Integer_32;
      Kinds, Tiers, Picks, Pick_Tiers : Kind_List := [others => 0];
      Len, Picked : Integer_32 := 0;
      First, Any_Tier_1 : Boolean;
      Swap    : Integer_32;
      Landmark : Integer_32;
      J       : Integer_32;
   begin
      V := R;
      P := V mod 8 - V mod 2;
      V := R;
      D := (if V mod 2 = 1 then 1 else -1);
      Open_Fill (I);
      Fills (I).Uses (Centre) := Lot;
      LV := Land_Value (I);
      for K in Commercial_First .. Commercial_Last loop
         if Spare (K) and then In_Window (K, LV) and then not Excluded (K) then
            Kinds (Len) := K;
            Tiers (Len) := 0;
            Len := Len + 1;
         end if;
      end loop;
      if Len < 8 then
         --  As in 1.2.91, tiers 1 and 2 record their tier one slot late.
         First := True;
         Any_Tier_1 := False;
         for K in Commercial_First .. Commercial_Last loop
            if Spare (K) and then LV <= Kind_Lv_Max (K) and then not Excluded (K) then
               Kinds (Len) := K;
               Tiers (Len) := (if First then 0 else 1);
               Len := Len + 1;
               First := False;
               Any_Tier_1 := True;
            end if;
         end loop;
         if Len < 8 then
            First := True;
            for K in Commercial_First .. Commercial_Last loop
               if Spare (K) and then LV >= Kind_Lv_Min (K) and then not Excluded (K) then
                  Kinds (Len) := K;
                  Tiers (Len) := (if First then (if Any_Tier_1 then 1 else 0) else 2);
                  Len := Len + 1;
                  First := False;
               end if;
            end loop;
         end if;
         if Len = 0 then
            Empty_Lots (I);
            return -1;
         end if;
      end if;
      if Len > 8 then
         --  As in 1.2.91, neighbours only filter a list longer than eight.
         Mark_Neighbours (X, Y);
         for K in reverse Integer_32 range 0 .. Len - 1 loop
            if Near (Kinds (K)) then
               Remove (Kinds, Len, K);
               Remove (Tiers, Len, K);
               Len := Len - 1;
            end if;
         end loop;
      end if;
      if Len = 0 then
         Empty_Lots (I);
         return -1;
      end if;
      while Picked < 8 and then Len > 0 loop
         J := R mod Len;
         Picks (Picked) := Kinds (J);
         Pick_Tiers (Picked) := Tiers (J);
         Picked := Picked + 1;
         Remove (Kinds, Len, J);
         Remove (Tiers, Len, J);
         Len := Len - 1;
      end loop;
      --  Larger kinds from better tiers go first.
      for A in Integer_32 range 0 .. Picked - 2 loop
         for B in A + 1 .. Picked - 1 loop
            if Kind_Size (Picks (B)) > Kind_Size (Picks (A))
              and then Pick_Tiers (B) < Pick_Tiers (A)
            then
               Swap := Picks (A);
               Picks (A) := Picks (B);
               Picks (B) := Swap;
               Swap := Pick_Tiers (A);
               Pick_Tiers (A) := Pick_Tiers (B);
               Pick_Tiers (B) := Swap;
            end if;
         end loop;
      end loop;
      Landmark := Place_Ring (I, Picks, Picked, P, D);
      if Landmark /= -1 then
         return Landmark;
      end if;
      Mixed_Leftovers (I);
      return -1;
   end Mixed_Businesses;

   --  Content 16: a bank on one side plus smaller kinds of the premium band.
   procedure Premium_Businesses (X, Y : Integer_32) is
      I      : constant Cell := Index_Of (X, Y);
      V      : Integer_32;
      P, D   : Integer_32;
      LV     : Integer_32;
      Kinds, Picks : Kind_List := [others => 0];
      Len, Keep, Picked : Integer_32 := 0;
      Swap   : Integer_32;
      Yard_Done, Soup_Done : Boolean := False;
      J, U   : Integer_32;
   begin
      V := R;
      P := V mod 8 - V mod 2;
      V := R;
      D := (if V mod 2 = 1 then 1 else -1);
      Open_Fill (I);
      Fills (I).Uses (Centre) := Lot;
      LV := Land_Value (I);
      for K in Commercial_First .. Commercial_Last loop
         if Spare (K) and then In_Window (K, LV) and then Kind_Size (K) <= 3
           and then K /= K_Bank
         then
            Kinds (Len) := K;
            Len := Len + 1;
         end if;
      end loop;
      if Len = 0 then
         Empty_Lots (I);
         return;
      end if;
      Mark_Neighbours (X, Y);
      for K in Integer_32 range 0 .. Len - 1 loop
         if not Near (Kinds (K)) then
            Kinds (Keep) := Kinds (K);
            Keep := Keep + 1;
         end if;
      end loop;
      Len := Keep;
      if Len = 0 then
         Empty_Lots (I);
         return;
      end if;
      Picks (0) := K_Bank;
      Picked := 1;
      while Picked < 8 and then Len > 0 loop
         J := R mod Len;
         Picks (Picked) := Kinds (J);
         Picked := Picked + 1;
         Remove (Kinds, Len, J);
         Len := Len - 1;
      end loop;
      for A in Integer_32 range 1 .. Picked - 2 loop
         for B in A + 1 .. Picked - 1 loop
            if Kind_Size (Picks (A)) < Kind_Size (Picks (B)) then
               Swap := Picks (A);
               Picks (A) := Picks (B);
               Picks (B) := Swap;
            end if;
         end loop;
      end loop;
      --  The premium placer ignores a whole-ring kind.
      Ignored := Place_Ring (I, Picks, Picked, P, D);
      for Row in Integer_32 range 1 .. 3 loop
         for Col in Integer_32 range 1 .. 3 loop
            J := (Row - 1) * 3 + (Col - 1);
            if Fills (I).Uses (J) = None then
               if Yard_Done then
                  U := (if Soup_Done then 2 else 1);
               elsif Soup_Done then
                  U := 0;
               else
                  U := R mod 2;
               end if;
               if U = 0 and then Col /= 2 and then Row /= 2 then
                  U := (if Soup_Done then 2 else 1);
               end if;
               if U = 1 then
                  Fills (I).Uses (J) := Soup_Kitchen;
                  Soup_Done := True;
                  Place (K_Soup_Kitchen);
               elsif U = 2 then
                  Fills (I).Uses (J) := Lot;
               else
                  Fills (I).Uses (J) := Yard;
                  Yard_Done := True;
               end if;
            end if;
         end loop;
      end loop;
   end Premium_Businesses;

   --  After every logged build, in build order.
   procedure On_Build (X, Y, Requested, Result : Integer_32) is
      I   : constant Cell := Index_Of (X, Y);
      Row : Integer_32;
      Row_House : Boolean;
   begin
      if Requested = Newspaper and then Result = Newspaper then
         Whole_Block (I, K_Newspaper);
      elsif Requested = Radio and then Result = Radio then
         Whole_Block (I, K_Radio);
      elsif Requested = Docks and then Result = Docks then
         Whole_Block (I, K_Docks);
      elsif Requested = Department_Store and then Result = Department_Store then
         Whole_Block (I, K_Department_Store);
      elsif Requested = Bank_Large and then Result = Bank_Large then
         Whole_Block (I, K_Bank_Large);
      elsif Requested <= 3 or else Requested = Rail then
         --  Row-house strips hold one tenement; a shop strip adds to the
         --  plain residential count.
         Row_House := Result in 1 .. 3
           or else (Result = Rail and then Land_Value (I) <= 16#42#);
         if Result = 0 then
            Open_Fill (I);
            Fills (I).Uses := [others => House];
            Place (K_Residential);
         elsif Row_House then
            Row := 2 * (R mod 2) + 1;
            Open_Fill (I);
            Fills (I).Uses := [others => House];
            Fills (I).Uses ((Row - 1) * 3 + 1) := Tenement;
            Fills (I).Uses (Centre) := Lot;
            Place (K_Tenement);
            --  As in 1.2.91, the tenement count keeps its 64 when the
            --  railway then takes the middle column.
            if Result = Rail then
               Fills (I).Uses (1) := Under_Rail;
               Fills (I).Uses (7) := Under_Rail;
            end if;
         end if;
      end if;
   end On_Build;

   ----------------------------------------------------------------------
   --  Building a block's content
   ----------------------------------------------------------------------

   procedure Strip (I : Cell) is
      S : Integer_32;
   begin
      if Land_Value (I) <= 16#42# then
         S := R mod 3;
         Content (I) := (if S = 0 then 2 elsif S = 1 then 1 else 3);
      else
         Content (I) := 0;
      end if;
   end Strip;

   procedure Build (X, Y, Id : Integer_32) is
      I      : Cell;
      Before : Integer_32;
      Kind   : Integer_32;
      S      : Integer_32;
   begin
      if Stuck or else Index_Of (X, Y) not in Cell then
         return;
      end if;
      I := Index_Of (X, Y);
      Before := Content (I);
      case Id is
         when 0 .. 3 =>
            if Before = Empty then
               Content (I) := Id;
               Strip (I);
            end if;
         when 5 | 68 .. 70 | 19 .. 24 | 38 =>
            Content (I) := Id;
         when 11 .. 14 =>
            if Before = Empty then
               if not Eligible_Business (X, Y) then
                  Content (I) := Plaza;
               else
                  Content (I) := R mod 4 + Id;
               end if;
            end if;
         when 15 | 17 | 18 =>
            if Before = Empty then
               Kind := Mixed_Businesses (X, Y);
               if Kind /= -1 then
                  Content (I) := Kind;
               else
                  S := R mod 3;
                  Content (I) := (if S = 0 then 15 elsif S = 1 then 17 else 18);
               end if;
            end if;
         when 34 =>
            Content (I) :=
              (if Before = Avenue_V then Avenue_Crossing
               elsif Before = Rail then Rail_Over_Avenue else Id);
         when 35 =>
            Content (I) :=
              (if Before = River_H then Bridge
               elsif Before = Avenue_H then Avenue_Crossing else Id);
         when 39 =>
            if Before = River_H then
               Content (I) := Rail_Bridge;
            elsif Before = Avenue_H then
               Content (I) := Rail_Over_Avenue;
            elsif Before /= Station then
               if Land_Value (I) > 16#42# then
                  Land_Value (I) := 65;
               end if;
               Strip (I);
               Content (I) := Rail;
            end if;
         when 36 | 37 | 40 | 41 =>
            --  Two stacked builds from empty land; no entry of their own.
            if Before = Empty then
               Build (X, Y, (if Id = 36 then 34 elsif Id = 37 then 20
                             elsif Id = 40 then 20 else 34));
               Build (X, Y, (if Id = 41 or else Id = 40 then 39 else 35));
            end if;
            return;
         when 16 =>
            if Before = Empty then
               Premium_Businesses (X, Y);
               Content (I) := Id;
            end if;
         when others =>
            if Is_Park (Id) or else Id >= 42 or else Id in 4 | 6 | 7 | 8 | 9 | 10 then
               if Before = Empty then
                  Content (I) := Id;
               end if;
            else
               Content (I) := Id;
            end if;
      end case;
      On_Build (X, Y, Id, Content (I));
   end Build;

   ----------------------------------------------------------------------
   --  Land values and districts
   ----------------------------------------------------------------------

   Sqrt_Half : constant Long_Float := 0.70710678118654757;
   --  The double nearest to sqrt (0.5), the value 1.2.91 multiplies by.

   function Trunc_Positive (V : Long_Float) return Integer_32 is
      I : Integer_32 := Integer_32 (V);
   begin
      if Long_Float (I) > V then
         I := I - 1;
      end if;
      return I;
   end Trunc_Positive;

   function Isqrt (N : Integer_32) return Integer_32 is
     (Integer_32 (Hood.Units.Isqrt (Unsigned_64 (N))));

   function Value_For (Di : Integer_32; Dist : Integer_32) return Integer_32 is
      F      : Long_Float := 1.0;
      V      : Integer_32;
      Spread : Integer_32;
   begin
      for K in Integer_32 range 1 .. Dist loop
         F := F * Sqrt_Half;
      end loop;
      V := Trunc_Positive (Long_Float (Ds (Di).Value) * F);
      if V < Ds (Di).Floor then
         V := Ds (Di).Floor;
      end if;
      Spread := V * Ds (Di).Jitter / 100;
      V := R mod (Spread + 1) + V - (Spread + 1) / 2;
      return Integer_32'Min (255, Integer_32'Max (Ds (Di).Floor, V));
   end Value_For;

   --  The scratch grid of 1.2.91 is a flat 64 x 32 array indexed 32 x + y:
   --  a row past the bottom reads the next column, and columns past W read
   --  as district 0.
   function Id_At (X, Y : Integer_32) return Integer_32 is
      Flat : constant Integer_32 := 32 * X + Y;
      FX   : constant Integer_32 := Flat / 32;
      FY   : constant Integer_32 := Flat mod 32;
   begin
      return (if FX < W then Grid_Id (FY * W + FX) else 0);
   end Id_At;

   function Claim
     (Di, X, Y, V : Integer_32; Has_Owner : Boolean; OX, OY : Integer_32)
      return Boolean
   is
      I    : constant Cell := Index_Of (X, Y);
      Id   : constant Integer_32 := Grid_Id (I);
      Mine : Boolean;
   begin
      if Id = Blocked then
         return False;
      end if;
      if Id = Free then
         Grid_Id (I) := Di;
         Grid_Val (I) := V;
         Ds (Di).Claimed := Ds (Di).Claimed + 1;
         return True;
      end if;
      --  As in 1.2.91, the "already mine" test of the upper row reads the
      --  district from the mirrored lower row.
      Mine := (if Has_Owner then Id_At (OX, OY) = Di else Id = Di);
      if not Mine and then Grid_Val (I) < V then
         Ds (Id).Claimed := Ds (Id).Claimed - 1;
         Grid_Id (I) := Di;
         Grid_Val (I) := V;
         Ds (Di).Claimed := Ds (Di).Claimed + 1;
         return True;
      end if;
      return False;
   end Claim;

   function Room (Di : Integer_32) return Boolean is (Ds (Di).Budget > Ds (Di).Claimed);

   procedure Claim_Row
     (Di, X_Lo, X_Hi, Y_Lo, Y_Hi, V : Integer_32; Lo_In, Hi_In : Boolean;
      None : in out Boolean) is
   begin
      if Lo_In then
         if X_Lo >= 0 and then Claim (Di, X_Lo, Y_Lo, V, True, X_Lo, Y_Hi) then
            None := False;
         end if;
         if X_Hi /= X_Lo and then W > X_Hi and then Room (Di)
           and then Claim (Di, X_Hi, Y_Lo, V, True, X_Hi, Y_Hi)
         then
            None := False;
         end if;
      end if;
      if Y_Hi /= Y_Lo and then Hi_In and then Room (Di) then
         if X_Lo >= 0 and then Claim (Di, X_Lo, Y_Hi, V, False, 0, 0) then
            None := False;
         end if;
         if X_Hi /= X_Lo and then W > X_Hi and then Room (Di)
           and then Claim (Di, X_Hi, Y_Hi, V, False, 0, 0)
         then
            None := False;
         end if;
      end if;
   end Claim_Row;

   procedure Spread_Districts is
      Max_Radius : constant Integer_32 := W + H;
      Active     : Boolean := True;
      Iter, Err, Acc, R_Max, Err_Step : Integer_32;
      Y_Lo, Y_Hi, X_Lo, X_Hi, V : Integer_32;
      Lo_In, Hi_In, None : Boolean;
   begin
      while Active loop
         Active := False;
         for Di in Integer_32 range 0 .. D_Count - 1 loop
            --  1.2.91 guards the radius: the loop would not end otherwise.
            if Ds (Di).Budget > Ds (Di).Claimed and then Ds (Di).Radius <= Max_Radius then
               Active := True;
               Iter := 0;
               Err := 1;
               Acc := 0;
               R_Max := Ds (Di).Radius;
               Err_Step := 2 * Ds (Di).Radius - 1;
               None := True;
               loop
                  Y_Lo := Ds (Di).Y - Iter;
                  Y_Hi := Ds (Di).Y + Iter;
                  for I in Integer_32 range 0 .. R_Max loop
                     X_Hi := Ds (Di).X + I;
                     X_Lo := Ds (Di).X - I;
                     if W > X_Lo and then X_Hi >= 0 and then Room (Di) then
                        Lo_In := Y_Lo >= 0 and then H > Y_Lo;
                        Hi_In := Y_Hi >= 0 and then H > Y_Hi;
                        if Lo_In or else Hi_In then
                           V := Value_For (Di, Isqrt (Iter * Iter + I * I));
                           Claim_Row (Di, X_Lo, X_Hi, Y_Lo, Y_Hi, V, Lo_In, Hi_In, None);
                        end if;
                     end if;
                  end loop;
                  Iter := Iter + 1;
                  Acc := Acc + Err;
                  Err := Err + 2;
                  if 2 * Acc > Err_Step and then R_Max > Iter then
                     Acc := Acc - Err_Step;
                     Err_Step := Err_Step - 2;
                     Y_Hi := Ds (Di).Y + R_Max;
                     Y_Lo := Ds (Di).Y - R_Max;
                     for I in Integer_32 range 0 .. Iter loop
                        X_Lo := Ds (Di).X - I;
                        X_Hi := Ds (Di).X + I;
                        if W > X_Lo and then X_Hi >= 0 and then Room (Di) then
                           Lo_In := Y_Lo >= 0 and then H > Y_Lo;
                           Hi_In := Y_Hi >= 0 and then H > Y_Hi;
                           if Lo_In or else Hi_In then
                              --  As in 1.2.91, the distance uses i - seed x.
                              V := Value_For
                                (Di, Isqrt ((I - Ds (Di).X) * (I - Ds (Di).X) + R_Max * R_Max));
                              Claim_Row (Di, X_Lo, X_Hi, Y_Lo, Y_Hi, V, Lo_In, Hi_In, None);
                           end if;
                        end if;
                     end loop;
                     R_Max := R_Max - 1;
                  end if;
                  exit when not (R_Max >= Iter);
               end loop;
               if None then
                  Ds (Di).Radius := Ds (Di).Radius + 1;
               end if;
            end if;
         end loop;
      end loop;
   end Spread_Districts;

   --  Values under 120 are shuffled inside 4 x 4 windows at four mirrored
   --  places.
   procedure Shuffle_Windows is
      Cells, Values, Ids, Out_V, Out_Id : array (Integer_32 range 0 .. 15) of Integer_32 :=
        [others => 0];
      Count, Pool, Pick, J, K, X0, Y0 : Integer_32;
      C : Cell;
   begin
      J := H / 2 - 1;
      while J > 1 loop
         K := W / 2 - 1;
         while K > 1 loop
            for M in Integer_32 range 0 .. 3 loop
               X0 := (if M = 0 or else M = 3 then K else W - K - 2);
               Y0 := (if M <= 1 then J else H - J - 2);
               Count := 0;
               for DY in Integer_32 range 0 .. 3 loop
                  for DX in Integer_32 range 0 .. 3 loop
                     if X0 + DX < W and then Y0 + DY < H then
                        C := Index_Of (X0 + DX, Y0 + DY);
                        if Grid_Id (C) /= Blocked and then Grid_Val (C) < 16#78# then
                           Cells (Count) := C;
                           Values (Count) := Grid_Val (C);
                           Ids (Count) := Grid_Id (C);
                           Count := Count + 1;
                        end if;
                     end if;
                  end loop;
               end loop;
               Pool := Count;
               for O in Integer_32 range 0 .. Count - 1 loop
                  Pick := R mod Pool;
                  Out_V (O) := Values (Pick);
                  Out_Id (O) := Ids (Pick);
                  for Q in Pick .. Pool - 2 loop
                     Values (Q) := Values (Q + 1);
                     Ids (Q) := Ids (Q + 1);
                  end loop;
                  Pool := Pool - 1;
               end loop;
               for O in Integer_32 range 0 .. Count - 1 loop
                  Grid_Val (Cells (O)) := Out_V (O);
                  Grid_Id (Cells (O)) := Out_Id (O);
               end loop;
            end loop;
            K := K - 2;
         end loop;
         J := J - 2;
      end loop;
   end Shuffle_Windows;

   procedure Grow_Districts is
      procedure Visit (X, Y : Integer_32) is
         I : Cell;
      begin
         if X < 0 or else X >= W or else Y < 0 or else Y >= H then
            return;
         end if;
         I := Index_Of (X, Y);
         if Grid_Id (I) >= Blocked then
            return;
         end if;
         Land_Value (I) := Grid_Val (I);
         Build (X, Y, Ds (Grid_Id (I)).Content_Id);
      end Visit;
      D : Integer_32 := 0;
   begin
      loop
         exit when CX - D < 0 and then W <= CX + D and then CY - D < 0 and then H <= CY + D;
         for I in Integer_32 range 0 .. D loop
            Visit (CX - D, CY - I);
            Visit (CX - D, CY + I);
            if D /= 0 then
               Visit (CX + D, CY + I);
               Visit (CX + D, CY - I);
            end if;
            if I /= D then
               Visit (CX + I, CY - D);
               Visit (CX - I, CY - D);
               Visit (CX - I, CY + D);
               Visit (CX + I, CY + D);
            end if;
         end loop;
         D := D + 1;
      end loop;
   end Grow_Districts;

   ----------------------------------------------------------------------
   --  Parks
   ----------------------------------------------------------------------

   type Mask_List is array (Integer_32 range 0 .. 11) of Integer_32;  --  up to 4 x 3 cells

   --  Edge masks, column-major (index x * h + y), -1 = not park.
   procedure Park_Masks (M : in out Mask_List; PW, PH : Integer_32) is
      function Get (X, Y : Integer_32) return Integer_32 is (M (X * PH + Y));
      U : Unsigned_32;
   begin
      for X in Integer_32 range 0 .. PW - 1 loop
         for Y in Integer_32 range 0 .. PH - 1 loop
            if Get (X, Y) >= 0 then
               U := Unsigned_32 (Get (X, Y));
               if X > 0 and then Y > 0 and then Get (X - 1, Y - 1) < 0 then
                  U := U or 16#10#;
               end if;
               if X < PW - 1 and then Y > 0 and then Get (X + 1, Y - 1) < 0 then
                  U := U or 16#80#;
               end if;
               if X > 0 and then Y < PH - 1 and then Get (X - 1, Y + 1) < 0 then
                  U := U or 16#20#;
               end if;
               if X < PW - 1 and then Y < PH - 1 and then Get (X + 1, Y + 1) < 0 then
                  U := U or 16#40#;
               end if;
               if X = 0 or else Get (X - 1, Y) < 0 then
                  U := (U or 2) and 16#CF#;
               end if;
               if (X < PW - 1 and then Get (X + 1, Y) < 0) or else PW - X = 1 then
                  U := (U or 8) and 16#3F#;
               end if;
               if Y = 0 or else Get (X, Y - 1) < 0 then
                  U := (U or 1) and 16#6F#;
               end if;
               if (Y < PH - 1 and then Get (X, Y + 1) < 0) or else PH - Y = 1 then
                  U := (U or 4) and 16#9F#;
               end if;
               M (X * PH + Y) := Integer_32 (U);
            end if;
         end loop;
      end loop;
   end Park_Masks;

   function Origin_X (Q : Integer_32) return Integer_32 is
     (if Q = 1 or else Q = 3 then W / 2 + 1 else 0);
   function Origin_Y (Q : Integer_32) return Integer_32 is
     (if Q = 2 or else Q = 3 then H / 2 + 1 else 0);

   function Clear_Of_River (Q, Top, Bottom : Integer_32) return Boolean is
     (if Q <= 1 then River_Min / 5 - 1 > Bottom else River_Max / 5 + 1 < Top);

   function Free_Count (PX, PY, PW, PH : Integer_32) return Integer_32 is
      N_Free : Integer_32 := 0;
   begin
      for Y in PY .. PY + PH - 1 loop
         for X in PX .. PX + PW - 1 loop
            if Content_At (X, Y) = Empty then
               N_Free := N_Free + 1;
            end if;
         end loop;
      end loop;
      return N_Free;
   end Free_Count;

   procedure Lay_Park (PX, PY, PW, PH : Integer_32; M : in out Mask_List) is
   begin
      for X in Integer_32 range 0 .. PW - 1 loop
         for Y in Integer_32 range 0 .. PH - 1 loop
            M (X * PH + Y) :=
              (if PX + X in 0 .. W - 1 and then PY + Y in 0 .. H - 1
                 and then Content_At (PX + X, PY + Y) = Empty then 0 else -1);
         end loop;
      end loop;
      Park_Masks (M, PW, PH);
      for X in Integer_32 range 0 .. PW - 1 loop
         for Y in Integer_32 range 0 .. PH - 1 loop
            if M (X * PH + Y) >= 0 then
               Land_Value (Index_Of (PX + X, PY + Y)) := R mod 8 + 67;
               Build (PX + X, PY + Y, Park_By_Mask (M (X * PH + Y) mod 16));
            end if;
         end loop;
      end loop;
      Parks (Park_Count) := (X => PX, Y => PY, W => PW, H => PH);
      Park_Count := Park_Count + 1;
   end Lay_Park;

   procedure Place_Parks is
      PW, PH, PX, PY, Tries : Integer_32;
      Ok : Boolean;
      M  : Mask_List;
   begin
      for Q in Integer_32 range 0 .. 3 loop
         Tries := 0;
         loop
            PW := R mod 3 + 2;
            PH := R mod 2 + 2;
            PX := R mod (W / 2 - PW - 1) + Origin_X (Q);
            PY := Origin_Y (Q) + R mod (H / 2 - PH - 1);
            Ok := Free_Count (PX, PY, PW, PH) = PW * PH
              and then Clear_Of_River (Q, PY, PY + PH);
            Tries := Tries + 1;
            exit when Ok or else Tries >= 1000;
         end loop;
         --  As in 1.2.91, a fit found on the 1,000th try still fails.
         if Tries < 1000 then
            M := [others => -1];
            Lay_Park (PX, PY, PW, PH, M);
            --  Tree densities: one draw per park cell.
            for K in Integer_32 range 0 .. PW * PH - 1 loop
               if M (K) >= 0 then
                  Skip;
               end if;
            end loop;
         end if;
      end loop;
   end Place_Parks;

   --  A 1 x 2 or 2 x 1 park for church grounds; returns its corner.
   procedure Place_Mini_Park (Q : Integer_32; PX, PY : out Integer_32) is
      PW, PH, Tries : Integer_32;
      Ok : Boolean;
      M  : Mask_List;
   begin
      Tries := 0;
      loop
         if R mod 2 = 1 then
            PW := 2;
            PH := 1;
         else
            PW := 1;
            PH := 2;
         end if;
         PX := R mod (W / 2 - PW - 1) + Origin_X (Q);
         PY := R mod (H / 2 - PH - 1) + Origin_Y (Q);
         Ok := Free_Count (PX, PY, PW, PH) = PW * PH
           and then Clear_Of_River (Q, PY, PY + PH);
         Tries := Tries + 1;
         exit when Ok or else Tries >= 1000;
      end loop;
      if Tries < 1000 then
         M := [others => -1];
         Lay_Park (PX, PY, PW, PH, M);
      end if;
      --  After 1,000 tries 1.2.91 keeps the last corner, without a park.
   end Place_Mini_Park;

   ----------------------------------------------------------------------
   --  One try
   ----------------------------------------------------------------------

   function Manhattan (P : Point; X, Y : Integer_32) return Integer_32 is
     (abs (P.X - X) + abs (P.Y - Y));

   --  As in 1.2.91, the civic spacing divides block coordinates by 5.
   function Near_5 (P : Point; X, Y : Integer_32) return Boolean is
     (abs (P.Y / 5 - Y) + abs (P.X / 5 - X) < 3);

   type Jitter_Kind is (Plus_Minus_One, Mask_7, Mask_15);

   function Jitter (J : Jitter_Kind) return Integer_32 is
      V, Off : Integer_32;
   begin
      case J is
         when Plus_Minus_One =>
            return (if R mod 2 = 1 then 1 else -1);
         when Mask_7 =>
            V := R mod 8;
            Off := 3;
         when Mask_15 =>
            V := R mod 16;
            Off := 7;
      end case;
      return (if V - Off <= 0 then V - Off - 1 else V - Off);
   end Jitter;

   --  Four landmarks around the outer avenue corners.
   procedure Ring
     (Id : Integer_32; J : Jitter_Kind; Low_Value : Boolean; Label : Loop_Label;
      Store : Boolean)
   is
      AX : Integer_32 := Cols (0);
      AY : Integer_32 := Rows (0);
      DX, DY, X, Y, V : Integer_32;
   begin
      for K in Integer_32 range 0 .. 3 loop
         if K = 1 then
            AX := Cols (3);
         elsif K = 2 then
            AY := Rows (3);
         elsif K = 3 then
            AX := Cols (0);
         end if;
         loop
            DX := Jitter (J);
            DY := Jitter (J);
            Spin (Label);
            if Stuck then
               return;
            end if;
            X := AX + DX;
            Y := AY + DY;
            exit when X < W and then X >= 0 and then Y < H and then Y >= 0
              and then Content_At (X, Y) = Empty;
         end loop;
         V := (if Low_Value then U8 (R mod 11 - 111) else R mod 11 + 70);
         Set_Grid (X, Y, V);
         Set_LV (X, Y, V);
         Build (X, Y, Id);
         if Store then
            Corners (K) := (X, Y);
         end if;
      end loop;
   end Ring;

   procedure Seed_District (X, Y, LV, Budget, Jitter_Pct, Floor, Id : Integer_32) is
      I : constant Integer_32 := Index_Of (X, Y);
   begin
      if D_Count = 12 then
         return;
      end if;
      Ds (D_Count) :=
        (X => X, Y => Y, Value => U8 (LV), Budget => Budget, Jitter => Jitter_Pct,
         Floor => Floor, Content_Id => Id, Claimed => 0, Radius => 1);
      if I in Cell and then Grid_Id (I) = Free then
         Grid_Val (I) := U8 (LV);
         Grid_Id (I) := D_Count;
      end if;
      D_Count := D_Count + 1;
   end Seed_District;

   procedure Lay_River is
      Row, X, Run_Left, Run_Length, Straight, T : Integer_32;
      Turned : Boolean;
   begin
      River_Min := 40;
      River_Max := 0;
      if not Has_River then
         River_Row := [others => H];
         --  As in 1.2.91, the no-river maximum is not multiplied by 5.
         River_Min := U8 (5 * H);
         River_Max := H + 4;
         return;
      end if;
      Row := R mod 4 + 16;
      X := 0;
      Straight := 0;
      loop
         Run_Left := R mod 4 + 5;
         Run_Length := Run_Left;
         if Straight < 5 then
            River_Min := Integer_32'Min (River_Min, Row);
            River_Max := Integer_32'Max (River_Max, Row);
            --  As in 1.2.91, a run builds run - 1 blocks (4 .. 7).
            loop
               Build (X, Row, River_H);
               River_Row (X) := Row;
               River_Turned (X) := False;
               River_Delta (X) := 0;
               X := X + 1;
               Run_Left := Run_Left - 1;
               exit when not (W > X and then Run_Left > 1);
            end loop;
         end if;
         if W - 2 > X then
            Straight := Straight + Run_Length;
            T := R mod 8;
            River_Row (X) := Row;
            River_Delta (X) := 0;
            Turned := False;
            if T <= 2 and then Row > 15 then
               Build (X, Row, River_Up);
               Row := Row - 1;
               River_Delta (X) := River_Delta (X) - 1;
               River_Turned (X) := True;
               if T = 0 and then Row > 15 then
                  Build (X, Row, River_V);
                  Row := Row - 1;
                  River_Delta (X) := River_Delta (X) - 1;
               end if;
               Build (X, Row, River_Up_Cap);
               Turned := True;
            elsif T >= 5 and then Row < 20 then
               Build (X, Row, River_Down);
               Row := Row + 1;
               River_Delta (X) := River_Delta (X) + 1;
               River_Turned (X) := True;
               if T = 7 and then Row < 20 then
                  Build (X, Row, River_V);
                  Row := Row + 1;
                  River_Delta (X) := River_Delta (X) + 1;
               end if;
               Build (X, Row, River_Down_Cap);
               Turned := True;
            elsif T = 3 or else T = 4 then
               Build (X, Row, River_H);
               River_Delta (X) := 0;
               River_Turned (X) := False;
            else
               --  A blocked turn: roll again without advancing.
               Spin (River_Turn);
               if Stuck then
                  return;
               end if;
               goto Next_Run;
            end if;
            if Turned then
               Straight := 0;
            end if;
            River_Min := Integer_32'Min (River_Min, Row + River_Delta (X));
            River_Max := Integer_32'Max (River_Max, Row + River_Delta (X));
            X := X + 1;
         else
            Straight := 0;
         end if;
         <<Next_Run>>
         exit when not (W > X);
      end loop;
      River_Min := U8 (River_Min * 5);
      River_Max := U8 (River_Max * 5 + 4);
   end Lay_River;

   procedure Lay_Railway is
      S, Row, V : Integer_32;
   begin
      if not Has_Rail then
         return;
      end if;
      loop
         S := R mod 2;
         Rail_Col := (if S = 1 then 10 else -16) + W / 2 + R mod 6;
         Spin (Rail_Column);
         if Stuck then
            return;
         end if;
         exit when not Turned_At (Rail_Col);
      end loop;
      for Station_Try in Integer_32 range 0 .. 2 * H - 1 loop
         Row := R mod (H - 10) + 5;
         if Content_At (Rail_Col, Row) = Empty then
            Build (Rail_Col, Row, Station);
            exit;
         end if;
      end loop;
      for RY in Integer_32 range 0 .. H - 1 loop
         if Content_At (Rail_Col, RY) /= Station then
            V := R mod 9 + 62;
            Set_Grid (Rail_Col, RY, V);
            Set_LV (Rail_Col, RY, V);
            Build (Rail_Col, RY, Rail);
         end if;
      end loop;
   end Lay_Railway;

   function Pick_Col (K : Integer_32) return Integer_32 is
      C : Integer_32;
   begin
      loop
         case K is
            when 0 => C := R mod 4 + 4;
            when 1 => C := 14 - R mod 4;
            when 2 => C := R mod 4 + 26;
            when others => C := W - R mod 4 - 2;
         end case;
         Spin (Avenue_Column);
         exit when Stuck or else not (Turned_At (C) or else C = Rail_Col);
      end loop;
      return C;
   end Pick_Col;

   function Pick_Row (K : Integer_32) return Integer_32 is
      C : Integer_32;
   begin
      loop
         case K is
            when 0 => C := R mod 3 + 3;
            when 1 => C := 12 - R mod 3;
            when 2 => C := R mod 3 + 21;
            when others => C := H + R mod 3 - 6;
         end case;
         Spin (Avenue_Row);
         exit when Stuck or else not (Has_Rail and then Content_At (Rail_Col, C) = Station);
      end loop;
      return C;
   end Pick_Row;

   procedure Lay_Avenues is
      V : Integer_32;
   begin
      for K in Integer_32 range 0 .. 3 loop
         Cols (K) := Pick_Col (K);
         if Stuck then
            return;
         end if;
      end loop;
      for K in Integer_32 range 0 .. 3 loop
         Rows (K) := Pick_Row (K);
         if Stuck then
            return;
         end if;
      end loop;
      for K in Integer_32 range 0 .. 3 loop
         for Y in Integer_32 range 0 .. H - 1 loop
            V := Content_At (Cols (K), Y);
            if V = Avenue_H or else V = Empty or else V = River_H then
               Build (Cols (K), Y, Avenue_V);
            end if;
         end loop;
         for X in Integer_32 range 0 .. W - 1 loop
            V := Content_At (X, Rows (K));
            if V = Avenue_V or else V = Empty or else V = Rail then
               Build (X, Rows (K), Avenue_H);
            end if;
         end loop;
      end loop;
   end Lay_Avenues;

   procedure Edge_Lot (X, Y : Integer_32) is
      V : Integer_32;
   begin
      if Content_At (X, Y) /= Empty then
         return;
      end if;
      V := R mod 13 + 67;
      Set_LV (X, Y, V);
      Build (X, Y, Shop_Strip);
      Set_Grid (X, Y, V);
   end Edge_Lot;

   procedure Lay_Edge is
   begin
      for X in Integer_32 range 0 .. W - 1 loop
         Edge_Lot (X, 0);
         Edge_Lot (X, H - 1);
      end loop;
      for Y in Integer_32 range 1 .. H - 2 loop
         Edge_Lot (0, Y);
         Edge_Lot (W - 1, Y);
      end loop;
      for I in Integer_32 range 0 .. 1 loop
         for B in Integer_32 range 0 .. 1 loop
            Edge_Lot (B + 1, I + 1);
            Edge_Lot (W - B - 2, I + 1);
            Edge_Lot (W - B - 2, H - I - 2);
            Edge_Lot (B + 1, H - I - 2);
         end loop;
      end loop;
      for I in Cell loop
         if Content (I) /= Empty then
            Grid_Id (I) := Blocked;
         end if;
      end loop;
   end Lay_Edge;

   procedure Lay_Centre is
      CX0 : constant Integer_32 := (Cols (1) + Cols (2)) / 2;
      CY0 : constant Integer_32 := (Rows (1) + Rows (2)) / 2;
      Q, DX, DY, X, Y, V : Integer_32;
      Clash : Boolean;
   begin
      loop
         CX := CX0 + R mod 5 - 2;
         CY := CY0 + R mod 5 - 2;
         Spin (City_Centre);
         if Stuck then
            return;
         end if;
         exit when Content_At (CX, CY) = Empty;
      end loop;
      V := U8 (R mod 11 - 61);
      Set_Grid (CX, CY, V);
      Set_LV (CX, CY, V);
      Build (CX, CY, Bank_Large);
      while Store_Count < 6 loop
         Q := Store_Count mod 4;
         loop
            DX := R mod 4 + 2;
            DY := R mod 4 + 2;
            if Q = 0 then
               DX := -DX;
               DY := -DY;
            elsif Q = 1 then
               DY := -DY;
            elsif Q = 2 then
               DX := -DX;
            end if;
            X := CX + DX;
            Y := CY + DY;
            Spin (Department_Store_Site);
            if Stuck then
               return;
            end if;
            exit when Content_At (X, Y) = Empty;
         end loop;
         Clash := False;
         for K in Integer_32 range 0 .. Store_Count - 1 loop
            if Manhattan (Stores (K), X, Y) < 3 then
               Clash := True;
            end if;
         end loop;
         if not Clash then
            V := U8 (R mod 11 - 61);
            Set_Grid (X, Y, V);
            Set_LV (X, Y, V);
            Build (X, Y, Department_Store);
            Stores (Store_Count) := (X, Y);
            Store_Count := Store_Count + 1;
         end if;
      end loop;
   end Lay_Centre;

   procedure Lay_Civics is
      Civic_Ids : constant array (Integer_32 range 0 .. 5) of Integer_32 :=
        [City_Hall, Courthouse, FBI_HQ, Police_HQ, Hospital, Fire_Dept];
      Prev_Side, Side, Idx, Tries, X, Y, V : Integer_32;
      Clash : Boolean;
   begin
      Prev_Side := -1;
      Idx := 0;
      while Idx < 6 loop
         Spin (Civic_Site_Loop);
         if Stuck then
            return;
         end if;
         loop
            Side := R mod 4;
            exit when Side /= Prev_Side;
         end loop;
         Prev_Side := Side;
         X := 0;
         Y := 0;
         Tries := Idx;
         loop
            case Side is
               when 0 =>
                  X := Cols (1) + 1;
                  Y := Rows (1) + R mod (Rows (2) - Rows (1) - 1) + 1;
               when 1 =>
                  Y := Rows (1) + 1;
                  X := Cols (1) + R mod (Cols (2) - Cols (1) - 1) + 1;
               when 2 =>
                  X := Cols (2) - 1;
                  Y := Rows (1) + R mod (Rows (2) - Rows (1) - 1) + 1;
               when others =>
                  Y := Rows (2) - 1;
                  X := Cols (1) + R mod (Cols (2) - Cols (1) - 1) + 1;
            end case;
            Tries := Tries + 1;
            exit when not (Content_At (X, Y) /= Empty and then Tries < 24);
         end loop;
         Clash := False;
         for K in Integer_32 range 0 .. Idx - 1 loop
            if Near_5 (Civics (K), X, Y) then
               Clash := True;
            end if;
         end loop;
         if not Clash then
            V := R mod 9 + 66;
            Set_Grid (X, Y, V);
            Set_LV (X, Y, V);
            --  An occupied site after 24 tries builds nothing (1.2.91).
            Civics (Idx) := (X, Y);
            Build (X, Y, Civic_Ids (Idx));
            Idx := Idx + 1;
         end if;
      end loop;
   end Lay_Civics;

   procedure Lay_Churches (Wanted : Integer_32) is
      Quadrants : constant array (Integer_32 range 0 .. 3) of Integer_32 := [0, 3, 1, 2];
      MX, MY, BX, BY, Id, Next_I, V : Integer_32;
   begin
      for QI in Integer_32 range 0 .. Wanted - 1 loop
         Place_Mini_Park (Quadrants (QI), MX, MY);
         BX := 0;
         BY := 0;
         Next_I := Index_Of (MX, MY) + 1;
         if Is_Park (if Next_I in Cell then Content (Next_I) else Empty) then
            for J in Integer_32 range 0 .. 1 loop
               V := R mod 11 + 70;
               Set_Grid (MX + J, MY, V);
               Set_LV (MX + J, MY, V);
            end loop;
            BX := 1;
            Id := Church_H;
         else
            for K in Integer_32 range 0 .. 1 loop
               V := R mod 11 + 70;
               Set_Grid (MX, MY + K, V);
               Set_LV (MX, MY + K, V);
            end loop;
            BY := R mod 2;
            Id := (if BY = 1 then Church_V_Lower else Church_V_Upper);
         end if;
         Build (MX + BX, MY + BY, Id);
         Churches (Church_Count) := (MX + BX, MY + BY);
         Church_Count := Church_Count + 1;
      end loop;
   end Lay_Churches;

   procedure Lay_Orphanage is
      X, Y, V : Integer_32;
   begin
      loop
         X := Cols (0) + R mod (Cols (3) - Cols (0) + 1);
         Y := Rows (0) + R mod (Rows (3) - Rows (0) + 1);
         Spin (Orphanage_Site);
         if Stuck then
            return;
         end if;
         exit when Content_At (X, Y) = Empty;
      end loop;
      V := R mod 11 + 70;
      Set_Grid (X, Y, V);
      Set_LV (X, Y, V);
      Build (X, Y, Orphanage);
   end Lay_Orphanage;

   procedure Lay_Inner_Civics is
      Ids : constant array (Integer_32 range 0 .. 3) of Integer_32 := [Employment, Museum, Baths, US_Post];
      Labels : constant array (Integer_32 range 0 .. 3) of Loop_Label :=
        [Employment_Site, Museum_Site, Baths_Site, Post_Site];
      Inner : array (Integer_32 range 0 .. 3) of Point := [others => (0, 0)];
      X, Y, V : Integer_32;
      Clear : Boolean;
   begin
      for K in Integer_32 range 0 .. 3 loop
         loop
            X := Cols (1) + R mod (Cols (2) - Cols (1) + 1);
            Y := Rows (1) + R mod (Rows (2) - Rows (1) + 1);
            Spin (Labels (K));
            if Stuck then
               return;
            end if;
            Clear := True;
            for C in Integer_32 range 0 .. 5 loop
               if Near_5 (Civics (C), X, Y) then
                  Clear := False;
               end if;
            end loop;
            for P in Integer_32 range 0 .. K - 1 loop
               if Manhattan (Inner (P), X, Y) < 3 then
                  Clear := False;
               end if;
            end loop;
            exit when Clear and then Content_At (X, Y) = Empty;
         end loop;
         V := R mod 11 + 70;
         Set_Grid (X, Y, V);
         Set_LV (X, Y, V);
         Content (Index_Of (X, Y)) := Ids (K);  --  set directly, no build
         Inner (K) := (X, Y);
      end loop;
   end Lay_Inner_Civics;

   procedure Seed_Commercial is
      Total, B, Share, V : Integer_32;
   begin
      Total := R mod 51 + 200;
      B := Total + R mod 41 - 64;
      V := R mod 11 - 61;
      Seed_District (CX, CY, V, B - 6 * (B / 8), 10, 80, Mixed);
      for K in Integer_32 range 0 .. Store_Count - 1 loop
         Seed_District (Stores (K).X, Stores (K).Y,
                        Land_Value (Index_Of (Stores (K).X, Stores (K).Y)),
                        B / 8, 10, 80, Mixed);
      end loop;
      Share := (Total - B) / 4;
      for K in Integer_32 range 0 .. 2 loop
         Seed_District (Corners (K).X, Corners (K).Y,
                        Land_Value (Index_Of (Corners (K).X, Corners (K).Y)),
                        Share, 10, 80, Mixed);
      end loop;
      Seed_District (Corners (3).X, Corners (3).Y,
                     Land_Value (Index_Of (Corners (3).X, Corners (3).Y)),
                     Total - 3 * Share - B, 10, 80, Mixed);
   end Seed_Commercial;

   Docks_X, Docks_Y : Integer_32;

   procedure Lay_Docks is
      AX, AY, Dir, DX, DY, Mirror, Segment, Step_In_Segment, Half, V : Integer_32;
      Found : Boolean := False;
   begin
      if Has_Rail then
         AX := Rail_Col;
      else
         AX := (if R mod 2 = 1 then Cols (3) else Cols (0));
      end if;
      if Has_River then
         AY := River_Row (AX);
      else
         AY := (if R mod 2 = 1 then Rows (2) else Rows (1));
      end if;
      Dir := R mod 4;
      DX := (if Dir = 0 then 1 elsif Dir = 2 then -1 else 0);
      DY := (if Dir = 1 then 1 elsif Dir = 3 then -1 else 0);
      Mirror := R mod 2;
      Segment := 1;
      Step_In_Segment := 0;
      Half := 0;
      for Steps in Integer_32 range 0 .. 1279 loop
         exit when Found;
         if Mirror = 1 then
            AX := AX - DX;
            AY := AY - DY;
         else
            AX := AX + DX;
            AY := AY + DY;
         end if;
         if AX >= 0 and then AX < W and then AY >= 0 and then AY < H
           and then Grid_Id (Index_Of (AX, AY)) = Free
         then
            if not Has_River then
               Found := True;
            elsif abs (River_Row (AX) - AY) = 1
              or else abs (River_Row (AX) + River_Delta (AX) - AY) = 1
            then
               Found := True;
            end if;
         end if;
         Step_In_Segment := Step_In_Segment + 1;
         if Step_In_Segment = Segment then
            Step_In_Segment := 0;
            if Half = 1 then
               Segment := Segment + 1;
            end if;
            Half := 1 - Half;
            if DX /= 0 then
               DY := (if DX > 0 then 1 else -1);
               DX := 0;
            else
               DX := (if DY > 0 then -1 else 1);
               DY := 0;
            end if;
         end if;
      end loop;
      --  Not found in 1,280 steps: 1.2.91 uses the last position.
      V := U8 (R mod 11 - 111);
      if Index_Of (AX, AY) in Cell then
         Grid_Val (Index_Of (AX, AY)) := V;
      end if;
      if not Has_River then
         Docks_Erased := True;  --  no river: the docks kind leaves the economy
      elsif Index_Of (AX, AY) in Cell then
         Grid_Id (Index_Of (AX, AY)) := Blocked;
         Set_LV (AX, AY, V);
         Content (Index_Of (AX, AY)) := Docks;
         On_Build (AX, AY, Docks, Docks);
      end if;
      Docks_X := AX;
      Docks_Y := AY;
   end Lay_Docks;

   procedure Near_Industry (Id : Integer_32; Label : Loop_Label) is
      X, Y, V : Integer_32;
   begin
      loop
         V := R mod 8;
         X := Docks_X + (if V >= 4 then V - 3 else V - 4);
         Spin (Label);
         if Stuck then
            return;
         end if;
         if X < 0 or else X >= W or else not Has_River then
            Y := Rows (1) + R mod (Rows (2) - Rows (1) + 1);
            exit when X >= 0 and then X < W and then Content_At (X, Y) = Empty;
         else
            Y := River_Row (X) - 1;
            if Content_At (X, Y) /= Empty then
               Y := Y + 2;
            end if;
            exit when Content_At (X, Y) = Empty;
         end if;
      end loop;
      V := R mod 11 + 70;
      Set_Grid (X, Y, V);
      Set_LV (X, Y, V);
      Build (X, Y, Id);
   end Near_Industry;

   procedure Fill_Leftovers is
      Sum, Count, C, Avg : Integer_32;
   begin
      for FY in Integer_32 range 0 .. H - 1 loop
         for FX in Integer_32 range 0 .. W - 1 loop
            if Grid_Id (Index_Of (FX, FY)) = Free then
               Sum := 0;
               Count := 0;
               for NY in FY - 2 .. FY + 2 loop
                  if NY in 0 .. H - 1 then
                     for NX in FX - 2 .. FX + 2 loop
                        if NX in 0 .. W - 1 and then not (NX = FX and then NY = FY) then
                           C := Content (Index_Of (NX, NY));
                           Sum := Sum + (if C = Single_Business then R mod 5 + 38
                                         elsif Is_River (C) then R mod 9 + 76
                                         else R mod 7 + 57);
                           Count := Count + 1;
                        end if;
                     end loop;
                  end if;
               end loop;
               if Count > 0 then
                  Avg := Sum / Count;
                  Set_LV (FX, FY, Integer_32'Min (Avg, 66));
                  Build (FX, FY, 2);
                  Set_LV (FX, FY, Avg);
               end if;
            end if;
         end loop;
      end loop;
   end Fill_Leftovers;

   procedure Try_Once (Seed : Unsigned_32; Churches_Wanted : Integer_32) is
      Roll, Layout, V : Integer_32;
   begin
      G := Hood.Random.Plan_Seeded (Seed);
      Stuck := False;
      Spins := [others => 0];
      Content := [others => Empty];
      Land_Value := [others => 0];
      Grid_Val := [others => 0];
      Grid_Id := [others => Free];
      River_Row := [others => 0];
      River_Turned := [others => False];
      River_Delta := [others => 0];
      Park_Count := 0;
      Church_Count := 0;
      Store_Count := 0;
      D_Count := 0;
      Cols := [others => 0];
      Rows := [others => 0];
      Civics := [others => (0, 0)];
      Corners := [others => (0, 0)];
      Rail_Col := W;
      CX := 0;
      CY := 0;

      --  Terrain roll: bit 0 river, bit 1 elevated railway.
      Roll := R mod 20;
      Layout := (if Roll = 0 then 1 elsif Roll = 1 then 2 else 3);
      Has_River := Layout mod 2 = 1;
      Has_Rail := (Layout / 2) mod 2 = 1;

      Lay_River;
      if not Stuck then
         Lay_Railway;
      end if;
      if not Stuck then
         Lay_Avenues;
      end if;
      if Stuck then
         return;
      end if;
      Lay_Edge;
      Lay_Centre;
      if not Stuck then
         Lay_Civics;
      end if;
      if not Stuck then
         Ring (Premium, Plus_Minus_One, True, Ring_Premium, True);
      end if;
      if not Stuck then
         Ring (Radio, Mask_7, False, Ring_Radio, False);
      end if;
      if not Stuck then
         Ring (Newspaper, Mask_7, False, Ring_Newspaper, False);
      end if;
      if Stuck then
         return;
      end if;
      Lay_Churches (Churches_Wanted);
      Ring (School, Mask_15, False, Ring_School, False);
      if not Stuck then
         Lay_Orphanage;
      end if;
      if not Stuck then
         Lay_Inner_Civics;
      end if;
      if Stuck then
         return;
      end if;
      Seed_Commercial;
      Lay_Docks;
      Near_Industry (Water_Plant, Water_Plant_Site);
      if not Stuck then
         Near_Industry (Power_Plant, Power_Plant_Site);
      end if;
      if Stuck then
         return;
      end if;
      V := R mod 10 + 46;
      Seed_District (Docks_X, Docks_Y,
                     (if Index_Of (Docks_X, Docks_Y) in Cell
                      then Grid_Val (Index_Of (Docks_X, Docks_Y)) else 0),
                     V, 10, 64, Single_Business);
      Spread_Districts;
      Shuffle_Windows;
      Grow_Districts;
      Place_Parks;
      Fill_Leftovers;
   end Try_Once;

   procedure Run
     (Seed     : Unsigned_32;
      Churches_Wanted : Integer_32;
      Retries  : out Integer_32;
      Ok       : out Boolean) is
   begin
      Present_Count := [others => 0];
      Docks_Erased := False;
      Overflow := False;
      for I in Cell loop
         Fills (I).Present := False;
         Fills (I).Firms := 0;
         Fills (I).Uses := [others => None];
      end loop;
      Ok := False;
      Retries := 0;
      for K in Integer_32 range 0 .. Max_Tries - 1 loop
         Try_Once (Seed + Unsigned_32 (K), Churches_Wanted);
         Retries := K;
         if not Stuck then
            Ok := True;
            return;
         end if;
      end loop;
   end Run;

end Hood.City.Plan;
